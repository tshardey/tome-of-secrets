import assert from "node:assert/strict";
import Anthropic from "@anthropic-ai/sdk";
import { costMicro, type Usage } from "../_shared/library-ai.ts";
import { type AskDb, handle, rpcDb, type SupabaseLike } from "./handler.ts";
import type { AskBook, AskResult } from "./prompt.ts";
import { type AskCall, askReserveMicro, type Asker, MODEL } from "./asker.ts";

const HH = "0b6f4f6e-6a3c-4c1e-9d55-2f1f0f3a9b10";
const CALL = "7d1f3a52-8e0b-4b6e-a7c4-5a1e9c2d4f01";
const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const USAGE: Usage = { inputTokens: 900, outputTokens: 300, cacheCreationTokens: 1200, cacheReadTokens: 0 };

const book = (n: number): AskBook => ({
  ref: n,
  bookId: id(n),
  title: `Glass Orchard ${n}`,
  authors: ["Member A"],
  seriesName: null,
  seriesVolume: null,
  pageCount: 300,
  publishYear: "2010",
  tags: [],
  summary: "A summary.",
  coverDescription: null,
  trimmedDescription: null,
});

function fakeDb(
  opts: { books?: AskBook[]; begin?: string; max?: number; beginThrows?: unknown; finishThrows?: unknown } = {},
) {
  const calls = {
    context: [] as unknown[][],
    begin: [] as unknown[][],
    finish: [] as unknown[][],
    release: [] as unknown[][],
    descriptions: [] as unknown[][],
  };
  const books = opts.books ?? [1, 2, 3, 4, 5, 6].map(book);
  const db: AskDb = {
    maxReserve: () => Promise.resolve(opts.max ?? 600_000),
    context(...a) {
      calls.context.push(a);
      return Promise.resolve(books);
    },
    begin(...a) {
      calls.begin.push(a);
      if (opts.beginThrows) return Promise.reject(opts.beginThrows);
      const outcome = opts.begin ?? "reserved";
      return Promise.resolve({ outcome, callId: outcome === "reserved" ? CALL : null });
    },
    finish(...a) {
      calls.finish.push(a);
      if (opts.finishThrows) return Promise.reject(opts.finishThrows);
      return Promise.resolve("done");
    },
    release(...a) {
      calls.release.push(a);
      return Promise.resolve("released");
    },
    descriptions(...a) {
      calls.descriptions.push(a);
      return Promise.resolve(new Map<string, string>([[id(2), "Long description."]]));
    },
  };
  return { db, calls };
}

const ok = (result: AskResult, usage: Usage = USAGE, rounds: 1 | 2 = 1): AskCall => ({ kind: "ok", result, usage, rounds });

function fakeAsker(over: { count?: () => Promise<number>; ask?: Asker["ask"] } = {}) {
  const calls = { count: 0, ask: 0 };
  const asker: Asker = {
    count: () => {
      calls.count++;
      return over.count ? over.count() : Promise.resolve(5000);
    },
    ask: (b, p, r) => {
      calls.ask++;
      return over.ask
        ? over.ask(b, p, r)
        : Promise.resolve(ok({ answerable: true, note: null, matches: [{ book: 2, confidence: 80, reason: "Fits." }] }));
    },
  };
  return { asker, calls };
}

const req = (body: unknown, method = "POST") =>
  new Request("http://x/library-ask", { method, body: body === undefined ? undefined : JSON.stringify(body) });
const valid = (over: Record<string, unknown> = {}) => ({
  householdId: HH,
  prompt: "A book with a blue cover",
  bookIds: [id(1), id(2)],
  ...over,
});

const RESERVE = askReserveMicro(5000);

Deno.test("ok: matches map to book ids, finish_ask gets the cost, usage and result count", async () => {
  const { db, calls } = fakeDb();
  const { asker } = fakeAsker();
  const res = await handle(req(valid()), { db, asker });
  assert.equal(res.status, 200);
  assert.deepEqual(await res.json(), {
    outcome: "ok",
    answerable: true,
    note: null,
    matches: [{ bookId: id(2), confidence: 80, reason: "Fits." }],
  });
  assert.deepEqual(calls.context[0], [HH, [id(1), id(2)]]);
  assert.deepEqual(calls.begin[0], [HH, RESERVE, 6]);
  const cost = costMicro(MODEL, USAGE);
  assert.deepEqual(calls.finish, [[CALL, cost, { ...USAGE, computedCostMicro: cost }, 1]]);
  assert.equal(calls.release.length, 0);
});

Deno.test("a match for a ref the list does not have never reaches the response", async () => {
  const { db } = fakeDb();
  const { asker } = fakeAsker({
    ask: () =>
      Promise.resolve(ok({
        answerable: true,
        note: null,
        matches: [
          { book: 99, confidence: 95, reason: "x" },
          { book: 0, confidence: 95, reason: "x" },
          { book: 3, confidence: 50, reason: "y" },
        ],
      })),
  });
  const body = await (await handle(req(valid()), { db, asker })).json();
  assert.deepEqual(body.matches, [{ bookId: id(3), confidence: 50, reason: "y" }]);
});

Deno.test("answerable false returns the note and no matches", async () => {
  const { db, calls } = fakeDb();
  const { asker } = fakeAsker({
    ask: () =>
      Promise.resolve(ok({
        answerable: false,
        note: "That depends on your own reading history.",
        matches: [{ book: 1, confidence: 90, reason: "x" }],
      })),
  });
  const body = await (await handle(req(valid()), { db, asker })).json();
  assert.deepEqual(body, {
    outcome: "ok",
    answerable: false,
    note: "That depends on your own reading history.",
    matches: [],
  });
  assert.equal(calls.finish[0][3], 0);
});

Deno.test("the tool read maps refs to book ids, through ask_descriptions for the household", async () => {
  const { db, calls } = fakeDb();
  const { asker } = fakeAsker({
    ask: async (_b, _p, read) => {
      const found = await read([2, 9, 1]);
      assert.deepEqual([...found], [[2, "Long description."]]);
      return ok({ answerable: true, note: null, matches: [] }, USAGE, 2);
    },
  });
  await handle(req(valid()), { db, asker });
  // Ref 9 is outside the 6-book list, so it is never looked up.
  assert.deepEqual(calls.descriptions, [[HH, [id(2), id(1)]]]);
});

Deno.test("more than 5 refs: only the first 5 are looked up", async () => {
  const { db, calls } = fakeDb();
  const { asker } = fakeAsker({
    ask: async (_b, _p, read) => {
      await read([1, 2, 3, 4, 5, 6]);
      return ok({ answerable: true, note: null, matches: [] });
    },
  });
  await handle(req(valid()), { db, asker });
  assert.equal((calls.descriptions[0][1] as string[]).length, 5);
});

Deno.test("the cost passed to finish_ask sums both rounds", async () => {
  const { db, calls } = fakeDb();
  const both: Usage = { inputTokens: 1800, outputTokens: 700, cacheCreationTokens: 1200, cacheReadTokens: 1200 };
  const { asker } = fakeAsker({ ask: () => Promise.resolve(ok({ answerable: true, note: null, matches: [] }, both, 2)) });
  await handle(req(valid()), { db, asker });
  assert.equal(calls.finish[0][1], costMicro(MODEL, both));
});

Deno.test("prompt of 301 characters -> 400, nothing called", async () => {
  const { db, calls } = fakeDb();
  const { asker, calls: a } = fakeAsker();
  const res = await handle(req(valid({ prompt: "x".repeat(301) })), { db, asker });
  assert.equal(res.status, 400);
  assert.equal(calls.context.length + calls.begin.length + a.count + a.ask, 0);
  assert.equal((await handle(req(valid({ prompt: "x".repeat(300) })), { db: fakeDb().db, asker })).status, 200);
});

Deno.test("validation: blank prompt, bad household, bad ids, too many ids, bad json, wrong method", async () => {
  const { db } = fakeDb();
  const { asker } = fakeAsker();
  const st = async (r: Request) => (await handle(r, { db, asker })).status;
  assert.equal(await st(req(valid({ prompt: "   " }))), 400);
  assert.equal(await st(req(valid({ prompt: 5 }))), 400);
  assert.equal(await st(req(valid({ householdId: "nope" }))), 400);
  assert.equal(await st(req(valid({ bookIds: ["nope"] }))), 400);
  assert.equal(await st(req(valid({ bookIds: "x" }))), 400);
  assert.equal(await st(req(valid({ bookIds: Array.from({ length: 2001 }, (_, i) => id(i)) }))), 400);
  assert.equal(await st(new Request("http://x", { method: "POST", body: "{" })), 400);
  assert.equal(await st(req(undefined, "GET")), 405);
  assert.equal(await st(req(valid({ bookIds: Array.from({ length: 2000 }, (_, i) => id(i)) }))), 200);
});

Deno.test("no books in the set -> empty, no count, no spend", async () => {
  const { db, calls } = fakeDb({ books: [] });
  const { asker, calls: a } = fakeAsker();
  assert.deepEqual(await (await handle(req(valid()), { db, asker })).json(), { outcome: "empty" });
  assert.equal(a.count + a.ask + calls.begin.length, 0);
});

Deno.test("count failing with 401 -> misconfigured, no begin_ask", async () => {
  const { db, calls } = fakeDb();
  const { asker, calls: a } = fakeAsker({
    count: () => Promise.reject(new Anthropic.AuthenticationError(401, undefined, "no", new Headers())),
  });
  assert.deepEqual(await (await handle(req(valid()), { db, asker })).json(), { outcome: "misconfigured" });
  assert.equal(calls.begin.length, 0);
  assert.equal(a.ask, 0);
});

Deno.test("count failing: 402 billing, 400 rejected, 429 and a plain error retry_later; never begin_ask", async () => {
  const cases: [Error, string][] = [
    [new Anthropic.APIError(402, { type: "error", error: { type: "billing_error", message: "x" } }, "x", new Headers()), "billing"],
    [new Anthropic.BadRequestError(400, undefined, "x", new Headers()), "rejected"],
    [new Anthropic.RateLimitError(429, undefined, "x", new Headers()), "retry_later"],
    [new Error("boom"), "retry_later"],
  ];
  for (const [err, outcome] of cases) {
    const { db, calls } = fakeDb();
    const { asker } = fakeAsker({ count: () => Promise.reject(err) });
    assert.deepEqual(await (await handle(req(valid()), { db, asker })).json(), { outcome });
    assert.equal(calls.begin.length, 0);
  }
});

Deno.test("too_large: reserve over ask_max_reserve_micro -> no begin_ask, no Claude ask", async () => {
  const { db, calls } = fakeDb({ max: 600_000 });
  const { asker, calls: a } = fakeAsker({ count: () => Promise.resolve(200_000) });
  assert.ok(askReserveMicro(200_000) > 600_000);
  assert.deepEqual(await (await handle(req(valid()), { db, asker })).json(), { outcome: "too_large" });
  assert.equal(calls.begin.length, 0);
  assert.equal(a.ask, 0);
  // Exactly at the cap is allowed.
  const { db: db2, calls: c2 } = fakeDb({ max: RESERVE });
  await handle(req(valid()), { db: db2, asker: fakeAsker().asker });
  assert.equal(c2.begin.length, 1);
});

Deno.test("budget: begin_ask says budget -> no Claude ask, nothing to release", async () => {
  const { db, calls } = fakeDb({ begin: "budget" });
  const { asker, calls: a } = fakeAsker();
  assert.deepEqual(await (await handle(req(valid()), { db, asker })).json(), { outcome: "budget" });
  assert.equal(a.ask, 0);
  assert.equal(calls.finish.length + calls.release.length, 0);
});

Deno.test("release policy: billed-unknown at the reservation, unbilled and 4xx at 0", async () => {
  const cases: [AskCall, string, number][] = [
    [{ kind: "retry", retryAfterSeconds: 3, billedUnknown: true }, "retry_later", RESERVE],
    [{ kind: "retry", retryAfterSeconds: 3, billedUnknown: false }, "retry_later", 0],
    [{ kind: "misconfigured" }, "misconfigured", 0],
    [{ kind: "billing" }, "billing", 0],
    [{ kind: "rejected" }, "rejected", 0],
  ];
  for (const [call, outcome, cost] of cases) {
    const { db, calls } = fakeDb();
    const { asker } = fakeAsker({ ask: () => Promise.resolve(call) });
    assert.deepEqual(await (await handle(req(valid()), { db, asker })).json(), { outcome });
    assert.deepEqual(calls.release, [[CALL, cost, null]]);
    assert.equal(calls.finish.length, 0);
  }
});

Deno.test("round-2 billing keeps round 1 actual cost", async () => {
  const { db, calls } = fakeDb();
  const { asker } = fakeAsker({ ask: () => Promise.resolve({ kind: "billing", usage: USAGE }) });
  assert.deepEqual(await (await handle(req(valid()), { db, asker })).json(), { outcome: "billing" });
  const cost = costMicro(MODEL, USAGE);
  assert.deepEqual(calls.release, [[CALL, cost, { ...USAGE, computedCostMicro: cost }]]);
  assert.ok(cost > 0);
});

Deno.test("round-2 misconfigured/rejected arrive as billed-unknown retries and release at the reservation", async () => {
  const { db, calls } = fakeDb();
  const { asker } = fakeAsker({ ask: () => Promise.resolve({ kind: "retry", retryAfterSeconds: null, billedUnknown: true }) });
  assert.deepEqual(await (await handle(req(valid()), { db, asker })).json(), { outcome: "retry_later" });
  assert.deepEqual(calls.release, [[CALL, RESERVE, null]]);
});

Deno.test("refusal and unreadable -> failed, released at the actual cost with usage", async () => {
  for (const code of ["ask_refused", "ask_unreadable"] as const) {
    const { db, calls } = fakeDb();
    const { asker } = fakeAsker({ ask: () => Promise.resolve({ kind: "fail", code, usage: USAGE }) });
    assert.deepEqual(await (await handle(req(valid()), { db, asker })).json(), { outcome: "failed" });
    const cost = costMicro(MODEL, USAGE);
    assert.deepEqual(calls.release, [[CALL, cost, { ...USAGE, computedCostMicro: cost }]]);
  }
});

Deno.test("a crash after begin_ask releases the call at the full reservation and answers 500", async () => {
  const { db, calls } = fakeDb();
  const { asker } = fakeAsker({ ask: () => Promise.reject(new Error("boom")) });
  const res = await handle(req(valid()), { db, asker });
  assert.equal(res.status, 500);
  assert.deepEqual(calls.release, [[CALL, RESERVE, null]]);
});

Deno.test("finish_ask failing releases at the reservation (stale if it had landed)", async () => {
  const { db, calls } = fakeDb({ finishThrows: new Error("db") });
  const res = await handle(req(valid()), { db, asker: fakeAsker().asker });
  assert.equal(res.status, 500);
  assert.deepEqual(calls.release, [[CALL, RESERVE, null]]);
});

Deno.test("a failing release in the crash path is swallowed, still 500", async () => {
  const { db } = fakeDb();
  db.release = () => Promise.reject(new Error("db"));
  const { asker } = fakeAsker({ ask: () => Promise.reject(new Error("boom")) });
  assert.equal((await handle(req(valid()), { db, asker })).status, 500);
});

Deno.test("42501 (not a member) -> 403; nothing released", async () => {
  const { db, calls } = fakeDb({ beginThrows: Object.assign(new Error("x"), { code: "42501" }) });
  const res = await handle(req(valid()), { db, asker: fakeAsker().asker });
  assert.equal(res.status, 403);
  assert.equal(calls.release.length, 0);
});

Deno.test("an error from begin_ask is not released (no call id yet)", async () => {
  const { db, calls } = fakeDb({ beginThrows: new Error("db") });
  const res = await handle(req(valid()), { db, asker: fakeAsker().asker });
  assert.equal(res.status, 500);
  assert.equal(calls.release.length, 0);
});

// ---------------------------------------------------------------------------
// rpcDb
// ---------------------------------------------------------------------------

function rpcStub(responses: Record<string, unknown>) {
  const calls: { fn: string; args: Record<string, unknown> }[] = [];
  const supabase: SupabaseLike = {
    schema: (name) => {
      assert.equal(name, "library");
      return {
        rpc: (fn, args) => {
          calls.push({ fn, args });
          const r = responses[fn];
          return Promise.resolve(r instanceof Error ? { data: null, error: r } : { data: r, error: null });
        },
      };
    },
  };
  return { supabase, calls };
}

Deno.test("rpcDb.context: refs follow the returned order; tags join; year from the publish date", async () => {
  const { supabase, calls } = rpcStub({
    ask_context: [
      {
        book_id: id(7),
        title: "The Salt Road",
        authors: ["Member A"],
        series_name: "Dry Sea",
        series_volume: "2",
        page_count: 321,
        publish_date: "2011-05-04",
        summary: "S",
        cover_description: "C",
        trimmed_description: null,
        tos_tags: ["fantasy"],
        library_tags: ["found-family"],
      },
      {
        book_id: id(8),
        title: "Glass Orchard",
        authors: null,
        series_name: null,
        series_volume: null,
        page_count: null,
        publish_date: null,
        summary: null,
        cover_description: null,
        trimmed_description: "Trim",
        tos_tags: null,
        library_tags: [],
      },
    ],
  });
  const books = await rpcDb(supabase).context(HH, [id(8), id(7)]);
  assert.deepEqual(calls[0], { fn: "ask_context", args: { p_household: HH, p_book_ids: [id(8), id(7)] } });
  assert.deepEqual(books[0], {
    ref: 1,
    bookId: id(7),
    title: "The Salt Road",
    authors: ["Member A"],
    seriesName: "Dry Sea",
    seriesVolume: 2,
    pageCount: 321,
    publishYear: "2011",
    tags: ["fantasy", "found-family"],
    summary: "S",
    coverDescription: "C",
    trimmedDescription: null,
  });
  assert.deepEqual(books[1], {
    ref: 2,
    bookId: id(8),
    title: "Glass Orchard",
    authors: [],
    seriesName: null,
    seriesVolume: null,
    pageCount: null,
    publishYear: null,
    tags: [],
    summary: null,
    coverDescription: null,
    trimmedDescription: "Trim",
  });
});

Deno.test("rpcDb: begin, finish, release, descriptions and maxReserve call the right RPCs", async () => {
  const { supabase, calls } = rpcStub({
    begin_ask: [{ outcome: "reserved", call_id: CALL }],
    finish_ask: "done",
    release_ask: "released",
    ask_descriptions: [{ book_id: id(1), description: "D" }, { book_id: id(2), description: null }],
    ask_max_reserve_micro: 600000,
  });
  const db = rpcDb(supabase);
  assert.deepEqual(await db.begin(HH, 123, 4), { outcome: "reserved", callId: CALL });
  assert.equal(await db.finish(CALL, 9, { a: 1 }, 2), "done");
  assert.equal(await db.release(CALL, 0, null), "released");
  assert.deepEqual([...await db.descriptions(HH, [id(1), id(2)])], [[id(1), "D"]]);
  assert.equal(await db.maxReserve(), 600000);
  assert.deepEqual(calls.map((c) => c.fn), [
    "begin_ask",
    "finish_ask",
    "release_ask",
    "ask_descriptions",
    "ask_max_reserve_micro",
  ]);
  assert.deepEqual(calls[0].args, { p_household: HH, p_reserve_micro: 123, p_book_count: 4 });
  assert.deepEqual(calls[1].args, { p_call: CALL, p_cost_micro: 9, p_usage: { a: 1 }, p_result_count: 2 });
  assert.deepEqual(calls[2].args, { p_call: CALL, p_cost_micro: 0, p_usage: null });
});

Deno.test("rpcDb throws the RPC error", async () => {
  const err = Object.assign(new Error("nope"), { code: "42501" });
  const { supabase } = rpcStub({ begin_ask: err });
  await assert.rejects(() => rpcDb(supabase).begin(HH, 1, 1), (e) => (e as { code: string }).code === "42501");
});
