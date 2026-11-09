// Processes one intake item: claim it, read its photos with the caller's
// RLS-scoped client, run vision, record the result. Every write goes through
// the library.*_intake_item RPCs, which check membership themselves.
//
// Logs carry error codes only: never titles, extraction contents or paths.
import type { Extraction, Usage, VisionClient } from "./vision.ts";

export const MAX_PHOTO_BYTES = 2 * 1024 * 1024; // matches the bucket's file_size_limit

const BACKOFF_BASE_S = 30;
const BACKOFF_CAP_S = 600;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export type ReleaseError = "photo_missing" | "vision_refused" | "vision_rejected" | "vision_unreadable";

export interface IntakeDb {
  claim(itemId: string): Promise<{
    outcome: string;
    claimToken: string | null;
    attempts: number;
    coverPath: string | null;
    titlePagePath: string | null;
    retryAt: string | null;
  }>;
  finish(itemId: string, claim: string, extraction: Extraction, usage: object): Promise<boolean>;
  release(itemId: string, claim: string, error: ReleaseError | null, retryAt: Date | null, usage?: object): Promise<string>;
  /** null when the object is missing (or not visible to the caller). */
  download(path: string): Promise<Uint8Array | null>;
}

export interface Deps {
  db: IntakeDb;
  vision: VisionClient;
  now(): Date;
}

/** max(retry-after, 30 s × 2^(attempts−1)), capped at 10 minutes (D2). */
export function backoffAt(now: Date, attempts: number, retryAfterSeconds: number | null): Date {
  const exp = BACKOFF_BASE_S * 2 ** Math.max(0, attempts - 1);
  const seconds = Math.min(BACKOFF_CAP_S, Math.max(retryAfterSeconds ?? 0, exp));
  return new Date(now.getTime() + seconds * 1000);
}

const json = (body: unknown, status = 200, headers: Record<string, string> = {}) =>
  Response.json(body, { status, headers });

const outcome = (value: string) => json({ outcome: value });

function errorCode(err: unknown): string {
  if (typeof err === "object" && err !== null) {
    const code = (err as { code?: unknown }).code;
    if (typeof code === "string") return code;
    const name = (err as { name?: unknown }).name;
    if (typeof name === "string") return name;
  }
  return "unknown";
}

async function readItemId(req: Request): Promise<string | null> {
  try {
    const body = await req.json();
    const id = (body as { itemId?: unknown } | null)?.itemId;
    return typeof id === "string" && UUID_RE.test(id) ? id : null;
  } catch {
    return null;
  }
}

export async function handle(req: Request, deps: Deps): Promise<Response> {
  if (req.method !== "POST") return json({ error: "method_not_allowed" }, 405, { allow: "POST" });
  const itemId = await readItemId(req);
  if (!itemId) return json({ error: "invalid_item_id" }, 400);

  const { db, vision, now } = deps;
  let claim: Awaited<ReturnType<IntakeDb["claim"]>> | null = null;
  try {
    claim = await db.claim(itemId);
    if (claim.outcome !== "claimed") return outcome(claim.outcome);
    const token = claim.claimToken;
    if (!token) throw Object.assign(new Error("claim_without_token"), { code: "claim_without_token" });

    // Cover first. A claimed item without a cover path counts as a missing photo.
    const paths = claim.titlePagePath ? [claim.coverPath, claim.titlePagePath] : [claim.coverPath];
    const images: Uint8Array[] = [];
    for (const path of paths) {
      const bytes = path ? await db.download(path) : null;
      if (!bytes || bytes.byteLength > MAX_PHOTO_BYTES) {
        await db.release(itemId, token, "photo_missing", null);
        return outcome("failed");
      }
      images.push(bytes);
    }

    const result = await vision.read(images);
    switch (result.kind) {
      case "ok": {
        const finished = await db.finish(itemId, token, result.extraction, result.usage);
        // false: the lease expired and another run owns the item now.
        return outcome(finished ? "ready" : "busy");
      }
      case "retry": {
        const status = await db.release(itemId, token, null, backoffAt(now(), claim.attempts, result.retryAfterSeconds));
        return outcome(status === "failed" ? "failed" : "retry_later");
      }
      case "misconfigured":
        await db.release(itemId, token, null, null);
        return outcome("misconfigured");
      case "fail":
        await db.release(itemId, token, result.code, null, result.usage as Usage | undefined);
        return outcome("failed");
    }
  } catch (err) {
    const code = errorCode(err);
    if (code === "42501") return json({ error: "forbidden" }, 403);
    console.error("library-intake failed", code);
    // Hand a claimed item back for a backed-off retry rather than leave it
    // processing until the lease expires. A stale claim is ignored by the RPC.
    if (claim?.outcome === "claimed" && claim.claimToken) {
      try {
        await db.release(itemId, claim.claimToken, null, backoffAt(now(), claim.attempts, null));
      } catch (releaseErr) {
        console.error("library-intake release failed", errorCode(releaseErr));
      }
    }
    return json({ error: "internal" }, 500);
  }
}

// ---------------------------------------------------------------------------
// The RPC-backed IntakeDb. Typed structurally so this file needs no Supabase import.
// ---------------------------------------------------------------------------

interface RpcResult {
  data: unknown;
  error: unknown;
}

export interface SupabaseLike {
  schema(name: string): { rpc(fn: string, args: Record<string, unknown>): PromiseLike<RpcResult> };
  storage: { from(bucket: string): { download(path: string): PromiseLike<{ data: Blob | null; error: unknown }> } };
}

function isNotFound(error: unknown): boolean {
  const e = error as { status?: unknown; statusCode?: unknown; originalError?: { status?: unknown } } | null;
  const statuses = [e?.status, e?.statusCode, e?.originalError?.status].map((s) => String(s));
  return statuses.includes("404") || statuses.includes("400");
}

export function rpcDb(supabase: SupabaseLike): IntakeDb {
  const rpc = async (fn: string, args: Record<string, unknown>) => {
    const { data, error } = await supabase.schema("library").rpc(fn, args);
    if (error) throw error;
    return data;
  };
  return {
    async claim(itemId) {
      const rows = (await rpc("claim_intake_item", { p_item: itemId })) as Record<string, unknown>[] | null;
      const row = Array.isArray(rows) ? rows[0] : rows;
      if (!row) throw Object.assign(new Error("claim_empty"), { code: "claim_empty" });
      return {
        outcome: String(row.outcome),
        claimToken: (row.claim_token as string | null) ?? null,
        attempts: Number(row.attempts ?? 0),
        coverPath: (row.cover_path as string | null) ?? null,
        titlePagePath: (row.title_page_path as string | null) ?? null,
        retryAt: (row.retry_at as string | null) ?? null,
      };
    },
    async finish(itemId, claim, extraction, usage) {
      return (await rpc("finish_intake_item", {
        p_item: itemId,
        p_claim: claim,
        p_extraction: extraction,
        p_usage: usage,
      })) === true;
    },
    async release(itemId, claim, error, retryAt, usage) {
      return String(
        await rpc("release_intake_item", {
          p_item: itemId,
          p_claim: claim,
          p_error: error,
          p_retry_at: retryAt ? retryAt.toISOString() : null,
          p_usage: usage ?? null,
        }),
      );
    },
    async download(path) {
      const { data, error } = await supabase.storage.from("library-intake").download(path);
      if (error) {
        if (isNotFound(error)) return null;
        throw error;
      }
      // An oversized object is refused before buffering; the handler treats it as missing.
      if (!data || data.size > MAX_PHOTO_BYTES) return null;
      return new Uint8Array(await data.arrayBuffer());
    },
  };
}
