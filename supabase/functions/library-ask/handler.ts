// Answers one Ask: load the household's books through ask_context, count the
// input tokens (free), reserve the exact worst case with begin_ask, make the
// Claude call(s), and settle the call with finish_ask or release_ask. Every
// RPC checks membership itself (Plan 7 D6, D8, D9, D10).
//
// Logs carry error codes only: never titles, authors, descriptions, prompts or tags.
import { classifyAiError, costMicro, type Usage } from "../_shared/library-ai.ts";
import { type AskCall, askReserveMicro, type Asker, MODEL } from "./asker.ts";
import { type AskBook, finalMatches, finalNote } from "./prompt.ts";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const MAX_PROMPT = 300;
const MAX_IDS = 2000;
/** read_descriptions is asked for at most this many books (D9). */
const MAX_READS = 5;

export interface AskDb {
  /** library.ask_max_reserve_micro(). */
  maxReserve(): Promise<number>;
  /** The household's books among the ids, refs 1..n in the order returned. */
  context(household: string, bookIds: string[]): Promise<AskBook[]>;
  begin(household: string, reserveMicro: number, bookCount: number): Promise<{ outcome: string; callId: string | null }>;
  finish(call: string, cost: number, usage: object, resultCount: number): Promise<string>;
  release(call: string, cost: number, usage: object | null): Promise<string>;
  /** Descriptions by book id, for the household's own books only. */
  descriptions(household: string, bookIds: string[]): Promise<Map<string, string>>;
}

export interface Deps {
  db: AskDb;
  asker: Asker;
}

const json = (body: unknown, status = 200, headers: Record<string, string> = {}) =>
  Response.json(body, { status, headers });

const outcome = (value: string) => json({ outcome: value });

/** The stored usage always carries the unclamped computed cost. */
const storedUsage = (u: Usage) => ({ ...u, computedCostMicro: costMicro(MODEL, u) });

function errorCode(err: unknown): string {
  if (typeof err === "object" && err !== null) {
    const code = (err as { code?: unknown }).code;
    if (typeof code === "string") return code;
    const name = (err as { name?: unknown }).name;
    if (typeof name === "string") return name;
  }
  return "unknown";
}

interface AskRequest {
  householdId: string;
  prompt: string;
  bookIds: string[];
}

async function readRequest(req: Request): Promise<AskRequest | null> {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return null;
  }
  const b = body as { householdId?: unknown; prompt?: unknown; bookIds?: unknown } | null;
  if (!b || typeof b.householdId !== "string" || !UUID_RE.test(b.householdId)) return null;
  if (typeof b.prompt !== "string") return null;
  const prompt = b.prompt.trim();
  if (prompt.length < 1 || prompt.length > MAX_PROMPT) return null;
  if (!Array.isArray(b.bookIds) || b.bookIds.length > MAX_IDS) return null;
  if (!b.bookIds.every((x) => typeof x === "string" && UUID_RE.test(x))) return null;
  return { householdId: b.householdId, prompt, bookIds: b.bookIds as string[] };
}

export async function handle(req: Request, deps: Deps): Promise<Response> {
  if (req.method !== "POST") return json({ error: "method_not_allowed" }, 405, { allow: "POST" });
  const input = await readRequest(req);
  if (!input) return json({ error: "invalid_request" }, 400);

  const { db, asker } = deps;
  let callId: string | null = null;
  let reserve = 0;
  try {
    const books = await db.context(input.householdId, input.bookIds);
    if (books.length === 0) return outcome("empty");

    // Counting is free, so any failure here has spent nothing.
    let tokens: number;
    try {
      tokens = await asker.count(books, input.prompt);
    } catch (err) {
      const c = classifyAiError(err);
      return outcome(c.kind === "retry" ? "retry_later" : c.kind);
    }

    reserve = askReserveMicro(tokens);
    if (reserve > (await db.maxReserve())) return outcome("too_large");

    const began = await db.begin(input.householdId, reserve, books.length);
    if (began.outcome !== "reserved" || !began.callId) return outcome(began.outcome);
    const call = began.callId;
    callId = call;

    // Refs are 1..n in the list order; only the household's own books can be read.
    const byRef = new Map(books.map((b) => [b.ref, b.bookId]));
    const readDescriptions = async (refs: number[]) => {
      const wanted = refs.filter((r) => byRef.has(r)).slice(0, MAX_READS);
      if (wanted.length === 0) return new Map<number, string>();
      const found = await db.descriptions(input.householdId, wanted.map((r) => byRef.get(r)!));
      const out = new Map<number, string>();
      for (const r of wanted) {
        const d = found.get(byRef.get(r)!);
        if (d !== undefined) out.set(r, d);
      }
      return out;
    };

    const result: AskCall = await asker.ask(books, input.prompt, readDescriptions);
    switch (result.kind) {
      case "ok": {
        const matches = finalMatches(result.result, books.length).map((m) => ({
          bookId: byRef.get(m.ref)!,
          confidence: m.confidence,
          reason: m.reason,
        }));
        const answerable = result.result.answerable;
        await db.finish(call, costMicro(MODEL, result.usage), storedUsage(result.usage), matches.length);
        callId = null;
        return json({ outcome: "ok", answerable, note: answerable ? null : finalNote(result.result), matches });
      }
      case "retry":
        // Billed-unknown (a connection error, or a round-2 failure after a billed
        // round 1) keeps the whole reservation, which covers both rounds.
        await db.release(call, result.billedUnknown ? reserve : 0, null);
        callId = null;
        return outcome("retry_later");
      case "billing":
        // Round 2 can fail on billing after a billed round 1: that spend is real.
        if (result.usage) {
          await db.release(call, costMicro(MODEL, result.usage), storedUsage(result.usage));
        } else {
          await db.release(call, 0, null);
        }
        callId = null;
        return outcome("billing");
      case "misconfigured":
      case "rejected":
        await db.release(call, 0, null);
        callId = null;
        return outcome(result.kind);
      case "fail":
        await db.release(call, costMicro(MODEL, result.usage), storedUsage(result.usage));
        callId = null;
        return outcome("failed");
    }
  } catch (err) {
    const code = errorCode(err);
    if (code !== "42501") console.error("library-ask failed", code);
    // A call may have been made, so a held reservation is kept whole rather
    // than left reserved against the month's budget. A settled call is ignored
    // by the RPC (stale).
    if (callId) {
      try {
        await db.release(callId, reserve, null);
      } catch (releaseErr) {
        console.error("library-ask release failed", errorCode(releaseErr));
      }
    }
    return code === "42501" ? json({ error: "forbidden" }, 403) : json({ error: "internal" }, 500);
  }
}

// ---------------------------------------------------------------------------
// The RPC-backed AskDb. Typed structurally so this file needs no Supabase import.
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
const numOrNull = (v: unknown): number | null => {
  if (v === null || v === undefined) return null;
  const n = Number(v);
  return Number.isNaN(n) ? null : n;
};
const yearOf = (v: unknown): string | null => typeof v === "string" ? v.match(/\d{4}/)?.[0] ?? null : null;

function toBook(row: Record<string, unknown>, ref: number): AskBook {
  return {
    ref,
    bookId: String(row.book_id),
    title: strOrNull(row.title) ?? "",
    authors: strings(row.authors),
    seriesName: strOrNull(row.series_name),
    seriesVolume: numOrNull(row.series_volume),
    pageCount: numOrNull(row.page_count),
    publishYear: yearOf(row.publish_date),
    tags: [...strings(row.tos_tags), ...strings(row.library_tags)],
    summary: strOrNull(row.summary),
    coverDescription: strOrNull(row.cover_description),
    trimmedDescription: strOrNull(row.trimmed_description),
  };
}

const first = (data: unknown): Record<string, unknown> | null => {
  const row = Array.isArray(data) ? data[0] : data;
  return typeof row === "object" && row !== null ? row as Record<string, unknown> : null;
};

export function rpcDb(supabase: SupabaseLike): AskDb {
  const rpc = async (fn: string, args: Record<string, unknown> = {}) => {
    const { data, error } = await supabase.schema("library").rpc(fn, args);
    if (error) throw error;
    return data;
  };
  return {
    async maxReserve() {
      return Number(await rpc("ask_max_reserve_micro"));
    },
    async context(household, bookIds) {
      const rows = await rpc("ask_context", { p_household: household, p_book_ids: bookIds });
      return (Array.isArray(rows) ? rows as Record<string, unknown>[] : []).map((r, i) => toBook(r, i + 1));
    },
    async begin(household, reserveMicro, bookCount) {
      const row = first(
        await rpc("begin_ask", { p_household: household, p_reserve_micro: reserveMicro, p_book_count: bookCount }),
      );
      if (!row) throw Object.assign(new Error("begin_empty"), { code: "begin_empty" });
      return { outcome: String(row.outcome), callId: strOrNull(row.call_id) };
    },
    async finish(call, cost, usage, resultCount) {
      return String(
        await rpc("finish_ask", { p_call: call, p_cost_micro: cost, p_usage: usage, p_result_count: resultCount }),
      );
    },
    async release(call, cost, usage) {
      return String(await rpc("release_ask", { p_call: call, p_cost_micro: cost, p_usage: usage }));
    },
    async descriptions(household, bookIds) {
      const rows = await rpc("ask_descriptions", { p_household: household, p_book_ids: bookIds });
      const out = new Map<string, string>();
      for (const r of Array.isArray(rows) ? rows as Record<string, unknown>[] : []) {
        if (typeof r.description === "string") out.set(String(r.book_id), r.description);
      }
      return out;
    },
  };
}
