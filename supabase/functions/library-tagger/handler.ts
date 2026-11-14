// Tags one queued book: claim the job (the RPC reserves budget first), load
// the published ToS tag list, download the cover from the library-covers
// allowlist, make one tagging call, clean the result, and record it. Every
// write goes through the library.*_tag_job RPCs, which check membership
// themselves (Plan 7 D7, D8, D10).
//
// Logs carry error codes only: never titles, authors, descriptions, tags or URLs.
import { backoffAt, costMicro, type Usage } from "../_shared/library-ai.ts";
import { fetchImages, hostAllowed } from "../library-covers/images.ts";
import { dedupeVocab, sanitizeTagResult, type TagInput, TOS_TAG_CAP, VOCAB_CAP } from "./prompt.ts";
import { MODEL, TAG_RESERVE_MICRO, type Tagger } from "./tagger.ts";
import { allowedTosTags, loadTosTagList } from "./tos-tags.ts";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export interface ClaimBook {
  title: string;
  authors: string[];
  seriesName: string | null;
  seriesVolume: number | null;
  description: string | null;
  coverUrl: string | null;
}

export interface Claim {
  outcome: string;
  claimToken: string | null;
  attempts: number;
  kind: "full" | "new_tags";
  book: ClaimBook | null;
  card: { summary: string; coverDescription: string | null } | null;
  vocab: { id: string; category: string }[];
  removed: { tos: string[]; library: string[] };
}

/** The p_result of finish_tag_job. */
export interface FinishResult {
  tos: string[];
  library: string[];
  summary: string;
  coverDescription: string | null;
  coverSeen: boolean;
  suggestions: { id: string; label: string; category: string; why: string }[];
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

    const full = claim.kind === "full";
    // Clamped so ceilingMicro (120 ToS ids, 578 vocabulary ids) stays a true bound.
    // A new_tags job considers only the vocabulary added since its card, so no ToS ids.
    const tosTags = full ? allowedTosTags(tosList).slice(0, TOS_TAG_CAP) : [];
    const vocab = dedupeVocab(claim.vocab).slice(0, VOCAB_CAP);
    const image = full ? await loadCover(claim.book.coverUrl, fetchImpl) : null;

    const input: TagInput = {
      kind: claim.kind,
      title: claim.book.title,
      authors: claim.book.authors,
      seriesName: claim.book.seriesName,
      seriesVolume: claim.book.seriesVolume,
      description: claim.book.description,
      card: claim.card,
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
        const result: FinishResult = {
          tos: clean.tosTags,
          library: clean.libraryTags,
          summary: clean.summary,
          coverDescription: clean.coverDescription,
          coverSeen: image !== null,
          suggestions: clean.suggestions,
        };
        const status = await db.finish(jobId, token, result, storedUsage(call.usage), costMicro(MODEL, call.usage), MODEL);
        // stale: the lease expired and another run owns the job now.
        return outcome(status === "stale" ? "busy" : status);
      }
      case "retry": {
        const status = await db.release(
          jobId,
          token,
          null,
          backoffAt(now(), claim.attempts, call.retryAfterSeconds),
          null,
          call.billedUnknown ? TAG_RESERVE_MICRO : 0,
        );
        return outcome(afterRetry(status));
      }
      case "misconfigured":
      case "billing":
        await db.release(jobId, token, call.kind, null, null, 0);
        return outcome(call.kind);
      case "rejected":
        await db.release(jobId, token, "tag_rejected", null, null, 0);
        return outcome("rejected");
      case "fail":
        await db.release(jobId, token, call.code, null, storedUsage(call.usage), costMicro(MODEL, call.usage));
        return outcome("failed");
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
        await db.release(jobId, claim.claimToken, null, backoffAt(now(), claim.attempts, null), null, TAG_RESERVE_MICRO);
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
        kind: row.kind === "new_tags" ? "new_tags" : "full",
        book: toBook(row.book),
        card: toCard(row.card),
        vocab: toVocab(row.vocab),
        removed: { tos: strings(removed?.tos), library: strings(removed?.library) },
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
