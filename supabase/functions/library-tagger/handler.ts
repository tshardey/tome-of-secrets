// Tags one queued book: claim the job (the RPC reserves budget first), load
// the published ToS tag list, download the cover from the library-covers
// allowlist, make one tagging call, clean the result, and record it. Every
// write goes through the library.*_tag_job RPCs, which check membership
// themselves (Plan 7 D7, D8, D10). A series job (Plan 10 D5) skips the ToS
// list and the cover and makes a series check instead, which may search the
// web when it is unsure (Plan 11 D8). Full and series jobs first look the
// book's ISBNs up on Open Library and send the household's other books by the
// same author (Plan 11 D6).
//
// Logs carry error codes only: never titles, authors, series, descriptions,
// tags, ISBNs or URLs.
import { backoffAt, costMicro, type Usage } from "../_shared/library-ai.ts";
import { fetchImages, hostAllowed } from "../library-covers/images.ts";
import { dedupeVocab, sanitizeTagResult, type TagInput, TOS_TAG_CAP, VOCAB_CAP } from "./prompt.ts";
import { openLibrarySeries } from "./openlibrary.ts";
import { type CleanSeries, cleanStatus, type SameAuthorBook, sanitizeSeries, type SeriesStatus } from "./series.ts";
import { MODEL, SERIES_RESERVE_MICRO, type SeriesCall, TAG_RESERVE_MICRO, type TagCall, type Tagger } from "./tagger.ts";
import { allowedTosTags, loadTosTagList } from "./tos-tags.ts";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export interface ClaimBook {
  title: string;
  authors: string[];
  seriesName: string | null;
  seriesVolume: number | null;
  description: string | null;
  coverUrl: string | null;
  /** Up to 2 ISBN-13s then up to 2 ISBN-10s (Plan 11 D6); [] before that migration. */
  isbns: string[];
}

export interface Claim {
  outcome: string;
  claimToken: string | null;
  attempts: number;
  kind: "full" | "new_tags" | "series";
  book: ClaimBook | null;
  card: { summary: string; coverDescription: string | null } | null;
  vocab: { id: string; category: string }[];
  removed: { tos: string[]; library: string[] };
  /** The household's series names (full and series claims); [] when the column is missing. */
  seriesNames: string[];
  /** The household's other books by the same author (full and series claims, D6). */
  sameAuthor: SameAuthorBook[];
  /**
   * Whether the claim row carried same_author at all, i.e. the database has
   * the Plan 11 migration (D1). Without it this handler never searches and
   * sends no seriesStatus, so an older finish_tag_job behaves as Plan 10.
   */
  hasSameAuthorColumn: boolean;
}

/**
 * The p_result of finish_tag_job. series is always sent by this version, null
 * or not: its presence is what marks the book checked (Plan 10 D3). A series
 * job sends no tags, card text or suggestions, and a null summary.
 * seriesStatus (Plan 11 D9) is sent only when the claim row had same_author;
 * an older database never sees the key.
 */
export interface FinishResult {
  tos: string[];
  library: string[];
  summary: string | null;
  coverDescription: string | null;
  coverSeen: boolean;
  suggestions: { id: string; label: string; category: string; why: string }[];
  series: CleanSeries | null;
  seriesStatus?: SeriesStatus | null;
}

export type ReleaseError =
  | "misconfigured"
  | "billing"
  | "tos_tags_unavailable"
  | "tag_refused"
  | "tag_rejected"
  | "tag_unreadable";

export interface TaggerDb {
  claim(id: string): Promise<Claim>;
  finish(id: string, claim: string, result: FinishResult, usage: object, cost: number, model: string): Promise<string>;
  release(
    id: string,
    claim: string,
    error: ReleaseError | null,
    retryAt: Date | null,
    usage: object | null,
    cost: number,
  ): Promise<string>;
}

export interface Deps {
  db: TaggerDb;
  tagger: Tagger;
  fetchImpl: typeof fetch;
  tosTagsUrl: string;
  now(): Date;
}

const json = (body: unknown, status = 200, headers: Record<string, string> = {}) =>
  Response.json(body, { status, headers });

const outcome = (value: string) => json({ outcome: value });

/** The stored usage always carries the unclamped computed cost. */
const storedUsage = (u: Usage) => ({ ...u, computedCostMicro: costMicro(MODEL, u) });

/** A release that requeues with retry_at reads retry_later; failed (the last attempt) reads failed. */
const afterRetry = (status: string) => status === "failed" ? "failed" : status === "stale" ? "busy" : "retry_later";

function errorCode(err: unknown): string {
  if (typeof err === "object" && err !== null) {
    const code = (err as { code?: unknown }).code;
    if (typeof code === "string") return code;
    const name = (err as { name?: unknown }).name;
    if (typeof name === "string") return name;
  }
  return "unknown";
}

async function readJobId(req: Request): Promise<string | null> {
  try {
    const body = await req.json();
    const id = (body as { jobId?: unknown } | null)?.jobId;
    return typeof id === "string" && UUID_RE.test(id) ? id : null;
  } catch {
    return null;
  }
}

/** The cover as one image, or null: no URL, a host outside the allowlist, or a failed download. */
async function loadCover(url: string | null, fetchImpl: typeof fetch): Promise<TagInput["image"]> {
  if (!url || !hostAllowed(url)) return null;
  try {
    const [img] = await fetchImages([url], fetchImpl);
    return img ? { mediaType: img.mediaType, bytes: img.bytes } : null;
  } catch {
    return null;
  }
}

/** seriesStatus only for a database that reads it (D1). */
const withStatus = (claim: Claim, result: FinishResult, status: SeriesStatus | null): FinishResult =>
  claim.hasSameAuthorColumn ? { ...result, seriesStatus: status } : result;

/** Open Library's series strings for the book; never throws, [] on any failure (Review Focus 3). */
async function lookUpOpenLibrary(book: ClaimBook, fetchImpl: typeof fetch): Promise<string[]> {
  if (book.isbns.length === 0) return [];
  try {
    return await openLibrarySeries(book.isbns, fetchImpl);
  } catch {
    return [];
  }
}

/** What claim_tag_job reserved for this kind (D8): a billed-unknown release keeps all of it. */
const reserveFor = (kind: Claim["kind"]) => kind === "series" ? SERIES_RESERVE_MICRO : TAG_RESERVE_MICRO;

/**
 * Releases a failed call as tagging always has: a retry backs off and keeps
 * the whole reservation when the call may have been billed; misconfigured,
 * billing and rejected cost 0; refused and unreadable cost what was used.
 */
async function releaseFailure(
  db: TaggerDb,
  jobId: string,
  token: string,
  claim: Claim,
  call: Exclude<TagCall | SeriesCall, { kind: "ok" }>,
  now: Date,
): Promise<Response> {
  // An unbilled failure after a billed two_step first call carries that
  // call's usage, so the release records it (SQL clamps it to the reserve).
  const earlier = "usage" in call && call.usage ? call.usage : null;
  const usage = earlier ? storedUsage(earlier) : null;
  const spent = earlier ? costMicro(MODEL, earlier) : 0;
  switch (call.kind) {
    case "retry": {
      const status = await db.release(
        jobId,
        token,
        null,
        backoffAt(now, claim.attempts, call.retryAfterSeconds),
        usage,
        call.billedUnknown ? Math.max(spent, reserveFor(claim.kind)) : spent,
      );
      return outcome(afterRetry(status));
    }
    case "misconfigured":
    case "billing":
      // release_tag_job settles these at 0 and gives the attempt back.
      await db.release(jobId, token, call.kind, null, usage, spent);
      return outcome(call.kind);
    case "rejected":
      await db.release(jobId, token, "tag_rejected", null, usage, spent);
      return outcome("rejected");
    case "fail":
      await db.release(jobId, token, call.code, null, storedUsage(call.usage), costMicro(MODEL, call.usage));
      return outcome("failed");
  }
}

/**
 * A series check (Plan 10 D5): text only, so no ToS list and no cover
 * download. It may search only when the database sent same_author (D1, D8).
 * The job settles at its true cost, which SQL caps at 10x the reservation (D10).
 */
async function handleSeries(jobId: string, token: string, claim: Claim, book: ClaimBook, deps: Deps): Promise<Response> {
  const openLibrary = await lookUpOpenLibrary(book, deps.fetchImpl);
  const call = await deps.tagger.findSeries({
    title: book.title,
    authors: book.authors,
    description: book.description,
    card: claim.card,
    seriesNames: claim.seriesNames,
    sameAuthor: claim.sameAuthor,
    openLibrary,
    allowSearch: claim.hasSameAuthorColumn,
  });
  if (call.kind !== "ok") return await releaseFailure(deps.db, jobId, token, claim, call, deps.now());
  let cost = costMicro(MODEL, call.usage);
  if (call.searchFailure) {
    console.error("library-tagger search failed", call.searchFailure);
    // The search call may have been billed and its usage is unknown: record
    // at least the whole reservation, as a billed-unknown release does.
    if (call.searchFailure === "billed_unknown") cost = Math.max(cost, SERIES_RESERVE_MICRO);
  }
  const checked = cleanStatus(call.status, sanitizeSeries(call.series));
  const result = withStatus(claim, {
    tos: [],
    library: [],
    summary: null,
    coverDescription: null,
    coverSeen: false,
    suggestions: [],
    series: checked.series,
  }, checked.status);
  const status = await deps.db.finish(jobId, token, result, storedUsage(call.usage), cost, MODEL);
  // stale: the lease expired and another run owns the job now.
  return outcome(status === "stale" ? "busy" : status);
}

export async function handle(req: Request, deps: Deps): Promise<Response> {
  if (req.method !== "POST") return json({ error: "method_not_allowed" }, 405, { allow: "POST" });
  const jobId = await readJobId(req);
  if (!jobId) return json({ error: "invalid_job_id" }, 400);

  const { db, tagger, fetchImpl, tosTagsUrl, now } = deps;
  let claim: Claim | null = null;
  try {
    claim = await db.claim(jobId);
    if (claim.outcome !== "claimed") return outcome(claim.outcome);
    const token = claim.claimToken;
    if (!token || !claim.book) throw Object.assign(new Error("claim_incomplete"), { code: "claim_incomplete" });
    if (claim.kind === "series") return await handleSeries(jobId, token, claim, claim.book, deps);

    // The ToS list unreachable: transient, before any Claude call, cost 0, and
    // the attempt is given back since nothing was sent (D7).
    let tosList;
    try {
      tosList = await loadTosTagList(tosTagsUrl, fetchImpl);
    } catch {
      const status = await db.release(
        jobId,
        token,
        "tos_tags_unavailable",
        backoffAt(now(), claim.attempts, null),
        null,
        0,
      );
      return outcome(afterRetry(status));
    }

    const kind = claim.kind === "new_tags" ? "new_tags" : "full";
    const full = kind === "full";
    // Clamped so ceilingMicro (120 ToS ids, 578 vocabulary ids) stays a true bound.
    // A new_tags job considers only the vocabulary added since its card, so no ToS ids.
    const tosTags = full ? allowedTosTags(tosList).slice(0, TOS_TAG_CAP) : [];
    const vocab = dedupeVocab(claim.vocab).slice(0, VOCAB_CAP);
    const image = full ? await loadCover(claim.book.coverUrl, fetchImpl) : null;
    // A new_tags job sends the card, not the book text, so no lookup for it.
    const openLibrary = full ? await lookUpOpenLibrary(claim.book, fetchImpl) : [];

    const input: TagInput = {
      kind,
      title: claim.book.title,
      authors: claim.book.authors,
      seriesName: claim.book.seriesName,
      seriesVolume: claim.book.seriesVolume,
      description: claim.book.description,
      card: claim.card,
      // buildTagContent sends the household block for a full job only.
      seriesNames: claim.seriesNames,
      sameAuthor: claim.sameAuthor,
      openLibrary,
      tosTags,
      vocab,
      image,
    };

    const call = await tagger.tag(input);
    switch (call.kind) {
      case "ok": {
        const clean = sanitizeTagResult(call.result, input, claim.removed, tosList.map((t) => t.id));
        // A full job must leave a card, or every later run would bill it again.
        if (full && clean.summary.trim() === "") {
          await db.release(jobId, token, "tag_unreadable", null, storedUsage(call.usage), costMicro(MODEL, call.usage));
          return outcome("failed");
        }
        // A full job never searches; an unsure answer is sent as such and SQL
        // queues the searched series check (D9).
        const result = withStatus(claim, {
          tos: clean.tosTags,
          library: clean.libraryTags,
          summary: clean.summary,
          coverDescription: clean.coverDescription,
          coverSeen: image !== null,
          suggestions: clean.suggestions,
          series: clean.series,
        }, clean.seriesStatus);
        const status = await db.finish(jobId, token, result, storedUsage(call.usage), costMicro(MODEL, call.usage), MODEL);
        // stale: the lease expired and another run owns the job now.
        return outcome(status === "stale" ? "busy" : status);
      }
      default:
        return await releaseFailure(db, jobId, token, claim, call, now());
    }
  } catch (err) {
    const code = errorCode(err);
    if (code === "42501") return json({ error: "forbidden" }, 403);
    console.error("library-tagger failed", code);
    // Hand a claimed job back as transient rather than leave it processing
    // until the lease expires. A call may have been made, so the whole
    // reservation is kept. A stale claim is ignored by the RPC.
    if (claim?.outcome === "claimed" && claim.claimToken) {
      try {
        await db.release(jobId, claim.claimToken, null, backoffAt(now(), claim.attempts, null), null, reserveFor(claim.kind));
      } catch (releaseErr) {
        console.error("library-tagger release failed", errorCode(releaseErr));
      }
    }
    return json({ error: "internal" }, 500);
  }
}

// ---------------------------------------------------------------------------
// The RPC-backed TaggerDb. Typed structurally so this file needs no Supabase import.
// ---------------------------------------------------------------------------

interface RpcResult {
  data: unknown;
  error: unknown;
}

export interface SupabaseLike {
  schema(name: string): { rpc(fn: string, args: Record<string, unknown>): PromiseLike<RpcResult> };
}

const strings = (v: unknown): string[] => Array.isArray(v) ? v.filter((x): x is string => typeof x === "string") : [];
const strOrNull = (v: unknown): string | null => typeof v === "string" ? v : null;
const obj = (v: unknown): Record<string, unknown> | null =>
  typeof v === "object" && v !== null && !Array.isArray(v) ? v as Record<string, unknown> : null;

/** A finite number, else null (jsonb can carry anything). */
const finiteOrNull = (v: unknown): number | null => typeof v === "number" && Number.isFinite(v) ? v : null;

/** same_author rows (D6), defensively: a row without a non-blank string title is skipped. */
function toSameAuthor(v: unknown): SameAuthorBook[] {
  if (!Array.isArray(v)) return [];
  return v.flatMap((x) => {
    const r = obj(x);
    if (!r || typeof r.title !== "string" || r.title.trim() === "") return [];
    return [{ title: r.title, seriesName: strOrNull(r.seriesName), seriesVolume: finiteOrNull(r.seriesVolume) }];
  });
}

function toBook(v: unknown): ClaimBook | null {
  const b = obj(v);
  if (!b) return null;
  const volume = b.seriesVolume === null || b.seriesVolume === undefined ? null : Number(b.seriesVolume);
  return {
    title: strOrNull(b.title) ?? "",
    authors: strings(b.authors),
    seriesName: strOrNull(b.seriesName),
    seriesVolume: volume === null || Number.isNaN(volume) ? null : volume,
    description: strOrNull(b.description),
    coverUrl: strOrNull(b.coverUrl),
    isbns: strings(b.isbns),
  };
}

function toCard(v: unknown): Claim["card"] {
  const c = obj(v);
  if (!c || typeof c.summary !== "string") return null;
  return { summary: c.summary, coverDescription: strOrNull(c.coverDescription) };
}

function toVocab(v: unknown): Claim["vocab"] {
  if (!Array.isArray(v)) return [];
  return v.flatMap((t) => {
    const r = obj(t);
    return r && typeof r.id === "string" && typeof r.category === "string" ? [{ id: r.id, category: r.category }] : [];
  });
}

export function rpcDb(supabase: SupabaseLike): TaggerDb {
  const rpc = async (fn: string, args: Record<string, unknown>) => {
    const { data, error } = await supabase.schema("library").rpc(fn, args);
    if (error) throw error;
    return data;
  };
  return {
    async claim(id) {
      const rows = (await rpc("claim_tag_job", { p_job: id })) as Record<string, unknown>[] | null;
      const row = Array.isArray(rows) ? rows[0] : rows;
      if (!row) throw Object.assign(new Error("claim_empty"), { code: "claim_empty" });
      const removed = obj(row.removed);
      return {
        outcome: String(row.outcome),
        claimToken: strOrNull(row.claim_token),
        attempts: Number(row.attempts ?? 0),
        kind: row.kind === "new_tags" || row.kind === "series" ? row.kind : "full",
        book: toBook(row.book),
        card: toCard(row.card),
        vocab: toVocab(row.vocab),
        removed: { tos: strings(removed?.tos), library: strings(removed?.library) },
        // Missing before the Plan 10 migration: then no household block is sent.
        seriesNames: strings(row.series_names),
        sameAuthor: toSameAuthor(row.same_author),
        // Missing before the Plan 11 migration (D1): then no search and no seriesStatus.
        hasSameAuthorColumn: "same_author" in row,
      };
    },
    async finish(id, claim, result, usage, cost, model) {
      return String(
        await rpc("finish_tag_job", {
          p_job: id,
          p_claim: claim,
          p_result: result,
          p_usage: usage,
          p_cost_micro: cost,
          p_model: model,
        }),
      );
    },
    async release(id, claim, error, retryAt, usage, cost) {
      return String(
        await rpc("release_tag_job", {
          p_job: id,
          p_claim: claim,
          p_error: error,
          p_retry_at: retryAt ? retryAt.toISOString() : null,
          p_usage: usage,
          p_cost_micro: cost,
        }),
      );
    },
  };
}
