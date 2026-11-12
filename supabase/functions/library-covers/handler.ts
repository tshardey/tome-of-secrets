// Screens one cover search: claim it (the RPC reserves budget first), download
// its candidate images from the allowlist, make one screening call, and record
// the ranked results. Every write goes through the library.*_cover_search
// RPCs, which check membership themselves.
//
// Logs carry error codes only: never titles, authors, notes or URLs.
import { fetchImages, MAX_IMAGES } from "./images.ts";
import { costMicro, rankedUrls, RESERVE_MICRO, type Screener, type ScreenInput, type Usage } from "./screen.ts";

const BACKOFF_BASE_S = 30;
const BACKOFF_CAP_S = 600;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export interface Candidate {
  url: string;
  source: "openlibrary" | "google";
  width: number;
  height: number;
  language: string | null;
  editionTitle: string | null;
}

export type ReleaseError = "misconfigured" | "billing" | "screen_refused" | "screen_rejected" | "screen_unreadable";

export interface CoversDb {
  claim(id: string): Promise<{
    outcome: string;
    claimToken: string | null;
    attempts: number;
    candidates: Candidate[];
    title: string;
    authors: string[];
    reasons: string[];
    note: string | null;
  }>;
  finish(id: string, claim: string, urls: string[], screening: object, usage: object, cost: number): Promise<string>;
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
  db: CoversDb;
  screener: Screener;
  fetchImpl: typeof fetch;
  now(): Date;
}

/** max(retry-after, 30 s × 2^(attempts−1)), capped at 10 minutes (the intake rule). */
export function backoffAt(now: Date, attempts: number, retryAfterSeconds: number | null): Date {
  const exp = BACKOFF_BASE_S * 2 ** Math.max(0, attempts - 1);
  const seconds = Math.min(BACKOFF_CAP_S, Math.max(retryAfterSeconds ?? 0, exp));
  return new Date(now.getTime() + seconds * 1000);
}

const json = (body: unknown, status = 200, headers: Record<string, string> = {}) =>
  Response.json(body, { status, headers });

const outcome = (value: string) => json({ outcome: value });

/** The stored usage always carries the unclamped computed cost (D3). */
const storedUsage = (u: Usage) => ({ ...u, computedCostMicro: costMicro(u) });

/** A release that ends gathered with retry_at reads retry_later; failed (the last attempt) reads failed. */
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

async function readSearchId(req: Request): Promise<string | null> {
  try {
    const body = await req.json();
    const id = (body as { searchId?: unknown } | null)?.searchId;
    return typeof id === "string" && UUID_RE.test(id) ? id : null;
  } catch {
    return null;
  }
}

export async function handle(req: Request, deps: Deps): Promise<Response> {
  if (req.method !== "POST") return json({ error: "method_not_allowed" }, 405, { allow: "POST" });
  const searchId = await readSearchId(req);
  if (!searchId) return json({ error: "invalid_search_id" }, 400);

  const { db, screener, fetchImpl, now } = deps;
  let claim: Awaited<ReturnType<CoversDb["claim"]>> | null = null;
  try {
    claim = await db.claim(searchId);
    if (claim.outcome !== "claimed") return outcome(claim.outcome);
    const token = claim.claimToken;
    if (!token) throw Object.assign(new Error("claim_without_token"), { code: "claim_without_token" });

    const candidates = claim.candidates.slice(0, MAX_IMAGES);
    const images = await fetchImages(candidates.map((c) => c.url), fetchImpl);

    // Dead or slow image hosts never bill: transient, cost 0 (D5).
    if (images.length === 0) {
      const status = await db.release(searchId, token, null, backoffAt(now(), claim.attempts, null), null, 0);
      return outcome(afterRetry(status));
    }

    // Sent renumbered 1..k in the order gathered; sentUrls[k-1] maps back.
    const sentUrls = images.map((img) => candidates[img.index].url);
    const input: ScreenInput = {
      title: claim.title,
      authors: claim.authors,
      reasons: claim.reasons,
      note: claim.note,
      images: images.map((img) => {
        const c = candidates[img.index];
        return { ...img, source: c.source, language: c.language, editionTitle: c.editionTitle, width: c.width, height: c.height };
      }),
    };

    const result = await screener.screen(input);
    switch (result.kind) {
      case "ok": {
        const cost = costMicro(result.usage);
        const screening = {
          verdicts: result.screening.verdicts.map((v) => ({ ...v, url: sentUrls[v.candidate - 1] ?? null })),
          ranking: result.screening.ranking,
        };
        const status = await db.finish(
          searchId,
          token,
          rankedUrls(result.screening, sentUrls),
          screening,
          storedUsage(result.usage),
          cost,
        );
        // stale: the lease expired and another run owns the search now.
        return outcome(status === "stale" ? "busy" : status);
      }
      case "retry": {
        const status = await db.release(
          searchId,
          token,
          null,
          backoffAt(now(), claim.attempts, result.retryAfterSeconds),
          null,
          result.billedUnknown ? RESERVE_MICRO : 0,
        );
        return outcome(afterRetry(status));
      }
      case "misconfigured":
      case "billing":
        await db.release(searchId, token, result.kind, null, null, 0);
        return outcome(result.kind);
      case "rejected":
        await db.release(searchId, token, "screen_rejected", null, null, 0);
        return outcome("rejected");
      case "fail":
        await db.release(searchId, token, result.code, null, storedUsage(result.usage), costMicro(result.usage));
        return outcome("failed");
    }
  } catch (err) {
    const code = errorCode(err);
    if (code === "42501") return json({ error: "forbidden" }, 403);
    console.error("library-covers failed", code);
    // Hand a claimed search back as transient rather than leave it processing
    // until the lease expires. A call may have been made, so the whole
    // reservation is kept. A stale claim is ignored by the RPC.
    if (claim?.outcome === "claimed" && claim.claimToken) {
      try {
        await db.release(searchId, claim.claimToken, null, backoffAt(now(), claim.attempts, null), null, RESERVE_MICRO);
      } catch (releaseErr) {
        console.error("library-covers release failed", errorCode(releaseErr));
      }
    }
    return json({ error: "internal" }, 500);
  }
}

// ---------------------------------------------------------------------------
// The RPC-backed CoversDb. Typed structurally so this file needs no Supabase import.
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

function toCandidates(v: unknown): Candidate[] {
  if (!Array.isArray(v)) return [];
  return v.flatMap((c): Candidate[] => {
    if (typeof c !== "object" || c === null) return [];
    const r = c as Record<string, unknown>;
    if (typeof r.url !== "string" || (r.source !== "openlibrary" && r.source !== "google")) return [];
    return [{
      url: r.url,
      source: r.source,
      width: Number(r.width) || 0,
      height: Number(r.height) || 0,
      language: strOrNull(r.language),
      editionTitle: strOrNull(r.editionTitle),
    }];
  });
}

export function rpcDb(supabase: SupabaseLike): CoversDb {
  const rpc = async (fn: string, args: Record<string, unknown>) => {
    const { data, error } = await supabase.schema("library").rpc(fn, args);
    if (error) throw error;
    return data;
  };
  return {
    async claim(id) {
      const rows = (await rpc("claim_cover_search", { p_search: id })) as Record<string, unknown>[] | null;
      const row = Array.isArray(rows) ? rows[0] : rows;
      if (!row) throw Object.assign(new Error("claim_empty"), { code: "claim_empty" });
      return {
        outcome: String(row.outcome),
        claimToken: strOrNull(row.claim_token),
        attempts: Number(row.attempts ?? 0),
        candidates: toCandidates(row.candidates),
        title: strOrNull(row.title) ?? "",
        authors: strings(row.authors),
        reasons: strings(row.reasons),
        note: strOrNull(row.note),
      };
    },
    async finish(id, claim, urls, screening, usage, cost) {
      return String(
        await rpc("finish_cover_search", {
          p_search: id,
          p_claim: claim,
          p_result_urls: urls,
          p_screening: screening,
          p_usage: usage,
          p_cost_micro: cost,
        }),
      );
    },
    async release(id, claim, error, retryAt, usage, cost) {
      return String(
        await rpc("release_cover_search", {
          p_search: id,
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
