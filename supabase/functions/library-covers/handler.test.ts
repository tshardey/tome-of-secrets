import assert from "node:assert/strict";
import { backoffAt, type Candidate, type CoversDb, handle, rpcDb, type SupabaseLike } from "./handler.ts";
import { costMicro, RESERVE_MICRO, type Screener, type ScreenInput, type ScreenResult } from "./screen.ts";

const SEARCH = "0b6f4f6e-6a3c-4c1e-9d55-2f1f0f3a9b10";
const CLAIM = "7d1f3a52-8e0b-4b6e-a7c4-5a1e9c2d4f01";
const NOW = new Date("2026-11-12T12:00:00.000Z");
const JPEG = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 1, 2, 3]);

const OL = (id: number) => `https://covers.openlibrary.org/b/id/${id}-L.jpg`;

const cand = (id: number, over: Partial<Candidate> = {}): Candidate => ({
  url: OL(id),
  source: "openlibrary",
  width: 400,
  height: 600,
  language: "eng",
  editionTitle: "The Salt Road",
  ...over,
});

type Claim = Awaited<ReturnType<CoversDb["claim"]>>;

function claimed(over: Partial<Claim> = {}): Claim {
  return {
    outcome: "claimed",
    claimToken: CLAIM,
    attempts: 1,
    candidates: [cand(1000001), cand(1000002), cand(1000003)],
    title: "The Salt Road",
    authors: ["Member A"],
    reasons: ["wrong_language"],
    note: null,
    ...over,
  };
}

function fakeDb(claim: Claim | (() => never), opts: { finish?: string; release?: string } = {}) {
  const calls = { claim: [] as string[], finish: [] as unknown[][], release: [] as unknown[][] };
  const db: CoversDb = {
    claim(id) {
      calls.claim.push(id);
      return Promise.resolve(typeof claim === "function" ? claim() : claim);
    },
    finish(...args) {
      calls.finish.push(args);
      return Promise.resolve(opts.finish ?? ((args[2] as string[]).length ? "ready" : "nothing_found"));
    },
    release(...args) {
      calls.release.push(args);
      return Promise.resolve(opts.release ?? (args[2] ? "failed" : "gathered"));
    },
  };
  return { db, calls };
}

function fakeScreen(result: ScreenResult | (() => never)) {
  const inputs: ScreenInput[] = [];
  const screener: Screener = {
    screen(input) {
      inputs.push(input);
      return Promise.resolve(typeof result === "function" ? result() : result);
    },
  };
  return { screener, inputs };
}

function fakeFetch(dead: string[] = []) {
  const urls: string[] = [];
  const fetchImpl = ((input: RequestInfo | URL) => {
    const url = String(input);
    urls.push(url);
    if (dead.includes(url)) return Promise.resolve(new Response("gone", { status: 404 }));
    return Promise.resolve(new Response(JPEG.slice(), { status: 200 }));
  }) as typeof fetch;
  return { fetchImpl, urls };
}

const post = (body: unknown) =>
  new Request("http://localhost/library-covers", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: typeof body === "string" ? body : JSON.stringify(body),
  });

const OK: ScreenResult = {
  kind: "ok",
  screening: {
    verdicts: [{ candidate: 1, verdict: "ok" }, { candidate: 2, verdict: "not_english" }, { candidate: 3, verdict: "ok" }],
    ranking: [3, 1],
  },
  usage: { inputTokens: 2000, outputTokens: 200 },
};

async function run(claim: Claim | (() => never), result: ScreenResult | (() => never), dead: string[] = [], dbOpts = {}) {
  const { db, calls } = fakeDb(claim, dbOpts);
  const { screener, inputs } = fakeScreen(result);
  const { fetchImpl, urls } = fakeFetch(dead);
  const res = await handle(post({ searchId: SEARCH }), { db, screener, fetchImpl, now: () => NOW });
  return { res, body: await res.json(), calls, inputs, urls };
}

Deno.test("a GET gives 405", async () => {
  const { db, calls } = fakeDb(claimed());
  const { screener } = fakeScreen(OK);
  const res = await handle(new Request("http://localhost/library-covers"), {
    db,
    screener,
    fetchImpl: fakeFetch().fetchImpl,
    now: () => NOW,
  });
  assert.equal(res.status, 405);
  assert.equal(calls.claim.length, 0);
});

Deno.test("a bad search id gives 400 with no claim", async () => {
  for (const body of [{ searchId: "nope" }, {}, "not json", { searchId: 7 }, null]) {
    const { db, calls } = fakeDb(claimed());
    const { screener } = fakeScreen(OK);
    const res = await handle(post(body), { db, screener, fetchImpl: fakeFetch().fetchImpl, now: () => NOW });
    assert.equal(res.status, 400, JSON.stringify(body));
    assert.equal(calls.claim.length, 0);
  }
});

Deno.test("each non-claimed outcome returns as is, with no fetch and no screen", async () => {
  for (const outcome of ["busy", "done", "retry_later", "failed", "budget", "not_gathered"]) {
    const { res, body, calls, inputs, urls } = await run(claimed({ outcome, claimToken: null, candidates: [] }), OK);
    assert.equal(res.status, 200);
    assert.deepEqual(body, { outcome });
    assert.equal(urls.length, 0, outcome);
    assert.equal(inputs.length, 0, outcome);
    assert.equal(calls.finish.length + calls.release.length, 0);
    assert.deepEqual(calls.claim, [SEARCH]);
  }
});

Deno.test("ok: finish gets the ranked URLs, the screening, the usage with computedCostMicro, and the cost", async () => {
  const { res, body, calls, inputs, urls } = await run(claimed(), OK);
  assert.equal(res.status, 200);
  assert.deepEqual(body, { outcome: "ready" });
  assert.equal(urls.length, 3);
  assert.equal(inputs.length, 1);
  const input = inputs[0];
  assert.equal(input.title, "The Salt Road");
  assert.deepEqual(input.authors, ["Member A"]);
  assert.deepEqual(input.reasons, ["wrong_language"]);
  assert.equal(input.images.length, 3);
  assert.deepEqual(input.images.map((i) => [i.index, i.source, i.language, i.width, i.height]), [
    [0, "openlibrary", "eng", 400, 600],
    [1, "openlibrary", "eng", 400, 600],
    [2, "openlibrary", "eng", 400, 600],
  ]);

  assert.equal(calls.finish.length, 1);
  assert.equal(calls.release.length, 0);
  const [id, claim, resultUrls, screening, usage, cost] = calls.finish[0];
  assert.equal(id, SEARCH);
  assert.equal(claim, CLAIM);
  assert.deepEqual(resultUrls, [OL(1000003), OL(1000001)]);
  const cost500 = costMicro({ inputTokens: 2000, outputTokens: 200 });
  assert.equal(cost, cost500);
  assert.deepEqual(usage, { inputTokens: 2000, outputTokens: 200, computedCostMicro: cost500 });
  assert.deepEqual(screening, {
    verdicts: [
      { candidate: 1, verdict: "ok", url: OL(1000001) },
      { candidate: 2, verdict: "not_english", url: OL(1000002) },
      { candidate: 3, verdict: "ok", url: OL(1000003) },
    ],
    ranking: [3, 1],
  });
});

Deno.test("ok: an overrun's computedCostMicro is stored unclamped", async () => {
  const over: ScreenResult = { ...OK, usage: { inputTokens: 60000, outputTokens: 0 } } as ScreenResult;
  const { calls } = await run(claimed(), over);
  const [, , , , usage, cost] = calls.finish[0];
  assert.equal((usage as { computedCostMicro: number }).computedCostMicro, 6000);
  assert.equal(cost, 6000);
  assert.ok((cost as number) > RESERVE_MICRO, "the SQL clamps; the handler doesn't");
});

Deno.test("ok: the URLs map back past a dead image, renumbered in order", async () => {
  // Candidate 2 is dead, so sent images are [c1, c3] as 1 and 2.
  const result: ScreenResult = {
    kind: "ok",
    screening: { verdicts: [{ candidate: 1, verdict: "ok" }, { candidate: 2, verdict: "ok" }], ranking: [2, 1] },
    usage: { inputTokens: 1, outputTokens: 1 },
  };
  const { calls, inputs } = await run(claimed(), result, [OL(1000002)]);
  assert.deepEqual(inputs[0].images.map((i) => i.index), [0, 2]);
  assert.deepEqual(calls.finish[0][2], [OL(1000003), OL(1000001)]);
});

Deno.test("ok: nothing passes gives nothing_found; a stale finish reads busy", async () => {
  const none: ScreenResult = {
    kind: "ok",
    screening: { verdicts: [{ candidate: 1, verdict: "placeholder" }], ranking: [] },
    usage: { inputTokens: 10, outputTokens: 10 },
  };
  const a = await run(claimed(), none);
  assert.deepEqual(a.body, { outcome: "nothing_found" });
  assert.deepEqual(a.calls.finish[0][2], []);
  const b = await run(claimed(), OK, [], { finish: "stale" });
  assert.deepEqual(b.body, { outcome: "busy" });
});

Deno.test("zero images: release with cost 0 and retry_at 30 s out at attempts 1, then retry_later, no screen", async () => {
  const dead = [OL(1000001), OL(1000002), OL(1000003)];
  const { body, calls, inputs } = await run(claimed(), OK, dead);
  assert.deepEqual(body, { outcome: "retry_later" });
  assert.equal(inputs.length, 0);
  assert.equal(calls.finish.length, 0);
  assert.deepEqual(calls.release, [[SEARCH, CLAIM, null, new Date(NOW.getTime() + 30_000), null, 0]]);
});

Deno.test("zero images on the last attempt reads failed", async () => {
  const dead = [OL(1000001), OL(1000002), OL(1000003)];
  const { body } = await run(claimed({ attempts: 3 }), OK, dead, { release: "failed" });
  assert.deepEqual(body, { outcome: "failed" });
});

Deno.test("workspace cap: billing releases billing at cost 0; rejected releases screen_rejected at cost 0", async () => {
  const billing = await run(claimed(), { kind: "billing" });
  assert.deepEqual(billing.body, { outcome: "billing" });
  assert.deepEqual(billing.calls.release, [[SEARCH, CLAIM, "billing", null, null, 0]]);

  const rejected = await run(claimed(), { kind: "rejected" });
  assert.deepEqual(rejected.body, { outcome: "rejected" });
  assert.deepEqual(rejected.calls.release, [[SEARCH, CLAIM, "screen_rejected", null, null, 0]]);

  const misconfigured = await run(claimed(), { kind: "misconfigured" });
  assert.deepEqual(misconfigured.body, { outcome: "misconfigured" });
  assert.deepEqual(misconfigured.calls.release, [[SEARCH, CLAIM, "misconfigured", null, null, 0]]);
});

Deno.test("retry: billedUnknown true costs the reservation, false costs 0; backoff honours retry-after", async () => {
  const unknown = await run(claimed({ attempts: 2 }), { kind: "retry", retryAfterSeconds: null, billedUnknown: true });
  assert.deepEqual(unknown.body, { outcome: "retry_later" });
  assert.deepEqual(unknown.calls.release, [[SEARCH, CLAIM, null, new Date(NOW.getTime() + 60_000), null, 4300]]);

  const known = await run(claimed(), { kind: "retry", retryAfterSeconds: 90, billedUnknown: false });
  assert.deepEqual(known.calls.release, [[SEARCH, CLAIM, null, new Date(NOW.getTime() + 90_000), null, 0]]);

  const last = await run(claimed({ attempts: 3 }), { kind: "retry", retryAfterSeconds: null, billedUnknown: false }, [], {
    release: "failed",
  });
  assert.deepEqual(last.body, { outcome: "failed" });
});

Deno.test("fail: release with the code, the usage with computedCostMicro, and its cost", async () => {
  const usage = { inputTokens: 3000, outputTokens: 400 };
  for (const code of ["screen_refused", "screen_unreadable"] as const) {
    const { body, calls } = await run(claimed(), { kind: "fail", code, usage });
    assert.deepEqual(body, { outcome: "failed" });
    assert.deepEqual(calls.release, [[SEARCH, CLAIM, code, null, { ...usage, computedCostMicro: 500 }, 500]]);
  }
});

Deno.test("claim errors: 42501 gives 403 with nothing else", async () => {
  const { res, calls, urls, inputs } = await run(() => {
    throw { code: "42501" };
  }, OK);
  assert.equal(res.status, 403);
  assert.equal(calls.release.length + calls.finish.length + urls.length + inputs.length, 0);
});

Deno.test("a screen that throws after a claim releases at the reservation and returns 500 with no detail", async () => {
  const { res, body, calls } = await run(claimed(), () => {
    throw new Error("The Salt Road https://covers.openlibrary.org/secret");
  });
  assert.equal(res.status, 500);
  assert.deepEqual(body, { error: "internal" });
  assert.deepEqual(calls.release, [[SEARCH, CLAIM, null, new Date(NOW.getTime() + 30_000), null, RESERVE_MICRO]]);
});

Deno.test("a claim that throws something else gives 500 without a release", async () => {
  const { res, calls } = await run(() => {
    throw { code: "57014" };
  }, OK);
  assert.equal(res.status, 500);
  assert.equal(calls.release.length, 0);
});

Deno.test("backoffAt matches intake: 30 s × 2^(attempts−1), at least retry-after, capped at 600 s", () => {
  const s = (d: Date) => (d.getTime() - NOW.getTime()) / 1000;
  assert.equal(s(backoffAt(NOW, 1, null)), 30);
  assert.equal(s(backoffAt(NOW, 2, null)), 60);
  assert.equal(s(backoffAt(NOW, 3, null)), 120);
  assert.equal(s(backoffAt(NOW, 1, 12)), 30);
  assert.equal(s(backoffAt(NOW, 1, 45)), 45);
  assert.equal(s(backoffAt(NOW, 1, 5000)), 600);
  assert.equal(s(backoffAt(NOW, 10, null)), 600);
});

// --- rpcDb ---------------------------------------------------------------

function fakeSupabase(answers: Record<string, { data: unknown; error: unknown }>) {
  const calls: { schema: string; fn: string; args: Record<string, unknown> }[] = [];
  const supabase: SupabaseLike = {
    schema(name) {
      return {
        rpc(fn, args) {
          calls.push({ schema: name, fn, args });
          return Promise.resolve(answers[fn] ?? { data: null, error: null });
        },
      };
    },
  };
  return { supabase, calls };
}

Deno.test("rpcDb.claim maps the row and its candidates", async () => {
  const { supabase, calls } = fakeSupabase({
    claim_cover_search: {
      data: [{
        outcome: "claimed",
        claim_token: CLAIM,
        attempts: 2,
        candidates: [cand(1000001), { ...cand(1000002), language: null, editionTitle: null }],
        title: "The Salt Road",
        authors: null,
        reasons: ["placeholder"],
        note: "too dark",
        retry_at: null,
      }],
      error: null,
    },
  });
  const row = await rpcDb(supabase).claim(SEARCH);
  assert.deepEqual(calls, [{ schema: "library", fn: "claim_cover_search", args: { p_search: SEARCH } }]);
  assert.equal(row.outcome, "claimed");
  assert.equal(row.claimToken, CLAIM);
  assert.equal(row.attempts, 2);
  assert.deepEqual(row.candidates, [cand(1000001), { ...cand(1000002), language: null, editionTitle: null }]);
  assert.deepEqual(row.authors, []);
  assert.deepEqual(row.reasons, ["placeholder"]);
  assert.equal(row.note, "too dark");
});

Deno.test("rpcDb.claim for a non-claimed outcome has empty fields", async () => {
  const { supabase } = fakeSupabase({
    claim_cover_search: {
      data: [{ outcome: "busy", claim_token: null, attempts: 1, candidates: null, title: null, authors: null, reasons: null, note: null }],
      error: null,
    },
  });
  const row = await rpcDb(supabase).claim(SEARCH);
  assert.equal(row.outcome, "busy");
  assert.equal(row.claimToken, null);
  assert.deepEqual(row.candidates, []);
});

Deno.test("rpcDb.finish and release send the RPC arguments", async () => {
  const { supabase, calls } = fakeSupabase({
    finish_cover_search: { data: "ready", error: null },
    release_cover_search: { data: "gathered", error: null },
  });
  const db = rpcDb(supabase);
  assert.equal(await db.finish(SEARCH, CLAIM, [OL(1)], { verdicts: [] }, { inputTokens: 1 }, 7), "ready");
  const at = new Date(NOW.getTime() + 30_000);
  assert.equal(await db.release(SEARCH, CLAIM, null, at, null, 0), "gathered");
  assert.deepEqual(calls[0].args, {
    p_search: SEARCH,
    p_claim: CLAIM,
    p_result_urls: [OL(1)],
    p_screening: { verdicts: [] },
    p_usage: { inputTokens: 1 },
    p_cost_micro: 7,
  });
  assert.deepEqual(calls[1].args, {
    p_search: SEARCH,
    p_claim: CLAIM,
    p_error: null,
    p_retry_at: at.toISOString(),
    p_usage: null,
    p_cost_micro: 0,
  });
});

Deno.test("rpcDb throws the RPC error so the handler can read its code", async () => {
  const { supabase } = fakeSupabase({ claim_cover_search: { data: null, error: { code: "42501", message: "not_authorized" } } });
  await assert.rejects(() => rpcDb(supabase).claim(SEARCH), (err: { code?: string }) => err.code === "42501");
});
