import assert from "node:assert/strict";
import { costMicro, type Usage } from "../_shared/library-ai.ts";
import { type Claim, type FinishResult, handle, rpcDb, type SupabaseLike, type TaggerDb } from "./handler.ts";
import type { TagInput, TagResult } from "./prompt.ts";
import { TOS_TAG_CAP } from "./prompt.ts";
import { MODEL, TAG_RESERVE_MICRO, type TagCall, type Tagger } from "./tagger.ts";

const JOB = "0b6f4f6e-6a3c-4c1e-9d55-2f1f0f3a9b10";
const TOKEN = "7d1f3a52-8e0b-4b6e-a7c4-5a1e9c2d4f01";
const NOW = new Date("2026-11-13T12:00:00.000Z");
const JPEG = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 1, 2, 3]);
const COVER = "https://covers.openlibrary.org/b/id/9000001-L.jpg";

const TOS_LIST = [
  { id: "fantasy", label: "Fantasy", category: "genre" },
  { id: "romance", label: "Romance", category: "genre" },
  { id: "audio", label: "Audio", category: "form", derivedFromType: "audio" },
  { id: "special-edition", label: "Special edition", category: "form" },
];

// The ToS list is cached per URL per isolate, so each test gets its own URL.
let urlSeq = 0;
const tosUrl = () => `https://tos.example/bookTags-${++urlSeq}.json`;

const USAGE: Usage = { inputTokens: 900, outputTokens: 300, cacheCreationTokens: 1200, cacheReadTokens: 0 };

function claimed(over: Partial<Claim> = {}): Claim {
  return {
    outcome: "claimed",
    claimToken: TOKEN,
    attempts: 1,
    kind: "full",
    book: {
      title: "The Salt Road",
      authors: ["Member A"],
      seriesName: null,
      seriesVolume: null,
      description: "A courier crosses a dry sea.",
      coverUrl: COVER,
    },
    card: null,
    vocab: [{ id: "found-family", category: "trope" }, { id: "cover-blue", category: "cover-colour" }],
    removed: { tos: [], library: [] },
    ...over,
  };
}

function fakeDb(claim: Claim | (() => never), opts: { finish?: string; release?: string } = {}) {
  const calls = { claim: [] as string[], finish: [] as unknown[][], release: [] as unknown[][] };
  const db: TaggerDb = {
    claim(id) {
      calls.claim.push(id);
      return Promise.resolve(typeof claim === "function" ? claim() : claim);
    },
    finish(...args) {
      calls.finish.push(args);
      return Promise.resolve(opts.finish ?? "done");
    },
    release(...args) {
      calls.release.push(args);
      return Promise.resolve(opts.release ?? (args[2] && args[2] !== "misconfigured" && args[2] !== "billing" ? "failed" : "queued"));
    },
  };
  return { db, calls };
}

const RESULT: TagResult = {
  tos_tags: ["fantasy", "romance"],
  library_tags: ["found-family", "cover-blue"],
  summary: "A courier crosses a dry sea.",
  cover_description: "A blue field.",
  suggestions: [],
};

function fakeTag(result: TagCall | (() => never)) {
  const inputs: TagInput[] = [];
  const tagger: Tagger = {
    tag(input) {
      inputs.push(input);
      return Promise.resolve(typeof result === "function" ? result() : result);
    },
  };
  return { tagger, inputs };
}

/** Serves the ToS list at any tos.example URL and a JPEG on the cover host; records every URL. */
function fakeFetch(opts: { tosStatus?: number; tosList?: unknown } = {}) {
  const urls: string[] = [];
  const fetchImpl = ((input: RequestInfo | URL) => {
    const url = String(input);
    urls.push(url);
    if (url.startsWith("https://tos.example/")) {
      return Promise.resolve(
        new Response(JSON.stringify(opts.tosList ?? TOS_LIST), {
          status: opts.tosStatus ?? 200,
          headers: { "content-type": "application/json" },
        }),
      );
    }
    if (url.startsWith("https://covers.openlibrary.org/")) {
      return Promise.resolve(new Response(JPEG, { status: 200, headers: { "content-type": "image/jpeg" } }));
    }
    return Promise.resolve(new Response("no", { status: 404 }));
  }) as typeof fetch;
  return { fetchImpl, urls };
}

const post = (body: unknown) =>
  new Request("http://localhost/library-tagger", { method: "POST", body: JSON.stringify(body) });

async function run(claim: Claim | (() => never), result: TagCall | (() => never), opts: {
  fetch?: ReturnType<typeof fakeFetch>;
  finish?: string;
  release?: string;
} = {}) {
  const { db, calls } = fakeDb(claim, opts);
  const { tagger, inputs } = fakeTag(result);
  const f = opts.fetch ?? fakeFetch();
  const res = await handle(post({ jobId: JOB }), {
    db,
    tagger,
    fetchImpl: f.fetchImpl,
    tosTagsUrl: tosUrl(),
    now: () => NOW,
  });
  return { res, body: await res.json(), calls, inputs, urls: f.urls };
}

Deno.test("non-claimed outcomes return at once: no fetch, no tag call", async () => {
  for (const outcome of ["busy", "done", "retry_later", "failed", "budget"]) {
    const { res, body, inputs, urls, calls } = await run(claimed({ outcome, claimToken: null }), { kind: "ok", result: RESULT, usage: USAGE });
    assert.equal(res.status, 200);
    assert.deepEqual(body, { outcome });
    assert.equal(urls.length, 0, outcome);
    assert.equal(inputs.length, 0, outcome);
    assert.equal(calls.finish.length + calls.release.length, 0, outcome);
  }
});

Deno.test("the ToS list failing releases retry_later at cost 0, with no tag call", async () => {
  const { body, inputs, calls } = await run(claimed(), { kind: "ok", result: RESULT, usage: USAGE }, {
    fetch: fakeFetch({ tosStatus: 503 }),
  });
  assert.deepEqual(body, { outcome: "retry_later" });
  assert.equal(inputs.length, 0);
  assert.equal(calls.release.length, 1);
  const [id, token, error, retryAt, usage, cost] = calls.release[0];
  assert.equal(id, JOB);
  assert.equal(token, TOKEN);
  assert.equal(error, null);
  assert.equal((retryAt as Date).toISOString(), "2026-11-13T12:00:30.000Z");
  assert.equal(usage, null);
  assert.equal(cost, 0);
});

Deno.test("a malformed ToS list is a list failure too", async () => {
  const { body, inputs } = await run(claimed(), { kind: "ok", result: RESULT, usage: USAGE }, {
    fetch: fakeFetch({ tosList: { not: "a list" } }),
  });
  assert.deepEqual(body, { outcome: "retry_later" });
  assert.equal(inputs.length, 0);
});

Deno.test("ok: finishes with costMicro(MODEL, usage), computedCostMicro, the sanitized result and the image", async () => {
  const { body, inputs, calls, urls } = await run(
    claimed({ removed: { tos: ["romance"], library: [] } }),
    { kind: "ok", result: RESULT, usage: USAGE },
  );
  assert.deepEqual(body, { outcome: "done" });
  assert.equal(urls.filter((u) => u === COVER).length, 1);
  assert.equal(inputs.length, 1);
  assert.deepEqual(inputs[0].tosTags, ["fantasy", "romance"]); // allowed: no audio, no special-edition
  assert.equal(inputs[0].image?.mediaType, "image/jpeg");
  assert.equal(calls.finish.length, 1);
  const [id, token, result, usage, cost, model] = calls.finish[0] as [string, string, FinishResult, Record<string, number>, number, string];
  assert.equal(id, JOB);
  assert.equal(token, TOKEN);
  assert.deepEqual(result, {
    tos: ["fantasy"],
    library: ["found-family", "cover-blue"],
    summary: "A courier crosses a dry sea.",
    coverDescription: "A blue field.",
    coverSeen: true,
    suggestions: [],
  });
  assert.equal(cost, costMicro(MODEL, USAGE));
  assert.equal(usage.computedCostMicro, costMicro(MODEL, USAGE));
  assert.equal(usage.inputTokens, 900);
  assert.equal(model, MODEL);
});

Deno.test("a cover on a host outside the allowlist sends no image and still finishes", async () => {
  const evil = "https://evil.example/cover.jpg";
  const book = { ...claimed().book!, coverUrl: evil };
  const { body, inputs, calls, urls } = await run(claimed({ book }), { kind: "ok", result: RESULT, usage: USAGE });
  assert.deepEqual(body, { outcome: "done" });
  assert.ok(!urls.includes(evil));
  assert.equal(inputs[0].image, null);
  const result = calls.finish[0][2] as FinishResult;
  assert.equal(result.coverSeen, false);
  assert.deepEqual(result.library, ["found-family"]); // no cover tags without an image
  assert.equal(result.coverDescription, null);
});

Deno.test("a cover that fails to download is no image, not an error", async () => {
  const book = { ...claimed().book!, coverUrl: "https://covers.openlibrary.org/missing.jpg" };
  const f = fakeFetch();
  const fetchImpl = ((input: RequestInfo | URL, init?: RequestInit) =>
    String(input).includes("missing") ? Promise.resolve(new Response("no", { status: 404 })) : f.fetchImpl(input, init)) as typeof fetch;
  const { body, inputs } = await run(claimed({ book }), { kind: "ok", result: RESULT, usage: USAGE }, { fetch: { fetchImpl, urls: f.urls } });
  assert.deepEqual(body, { outcome: "done" });
  assert.equal(inputs[0].image, null);
});

Deno.test("the ToS list is clamped to TOS_TAG_CAP ids, so ceilingMicro stays a bound", async () => {
  const big = Array.from({ length: 200 }, (_, i) => ({ id: `genre-${i}`, label: `Genre ${i}`, category: "genre" }));
  const { inputs } = await run(claimed(), { kind: "ok", result: RESULT, usage: USAGE }, { fetch: fakeFetch({ tosList: big }) });
  assert.equal(TOS_TAG_CAP, 120);
  assert.equal(inputs[0].tosTags.length, 120);
  assert.deepEqual(inputs[0].tosTags.slice(0, 2), ["genre-0", "genre-1"]);
});

Deno.test("new_tags: the card, no image fetch, no ToS ids, only the vocabulary claimed", async () => {
  const claim = claimed({
    kind: "new_tags",
    card: { summary: "A short card.", coverDescription: "A blue field." },
    vocab: [{ id: "salt-flats", category: "setting" }],
  });
  const { body, inputs, urls, calls } = await run(claim, {
    kind: "ok",
    result: { ...RESULT, tos_tags: ["fantasy"], library_tags: ["salt-flats"] },
    usage: USAGE,
  });
  assert.deepEqual(body, { outcome: "done" });
  assert.ok(!urls.includes(COVER));
  assert.equal(inputs[0].kind, "new_tags");
  assert.equal(inputs[0].image, null);
  assert.deepEqual(inputs[0].tosTags, []);
  assert.deepEqual(inputs[0].vocab, [{ id: "salt-flats", category: "setting" }]);
  assert.deepEqual(inputs[0].card, { summary: "A short card.", coverDescription: "A blue field." });
  const result = calls.finish[0][2] as FinishResult;
  assert.deepEqual(result.tos, []);
  assert.deepEqual(result.library, ["salt-flats"]);
  assert.equal(result.coverSeen, false);
});

Deno.test("a stale finish reads busy", async () => {
  const { body } = await run(claimed(), { kind: "ok", result: RESULT, usage: USAGE }, { finish: "stale" });
  assert.deepEqual(body, { outcome: "busy" });
});

Deno.test("billing and misconfigured release at cost 0 and return their kind", async () => {
  for (const kind of ["billing", "misconfigured"] as const) {
    const { body, calls } = await run(claimed(), { kind });
    assert.deepEqual(body, { outcome: kind });
    assert.deepEqual(calls.release[0].slice(2), [kind, null, null, 0]);
  }
});

Deno.test("retry billed unknown releases at TAG_RESERVE_MICRO; a plain retry at 0", async () => {
  const unknown = await run(claimed({ attempts: 2 }), { kind: "retry", retryAfterSeconds: null, billedUnknown: true });
  assert.deepEqual(unknown.body, { outcome: "retry_later" });
  const [, , error, retryAt, usage, cost] = unknown.calls.release[0];
  assert.equal(error, null);
  assert.equal((retryAt as Date).toISOString(), "2026-11-13T12:01:00.000Z");
  assert.equal(usage, null);
  assert.equal(cost, TAG_RESERVE_MICRO);

  const plain = await run(claimed(), { kind: "retry", retryAfterSeconds: 120, billedUnknown: false });
  assert.equal((plain.calls.release[0][3] as Date).toISOString(), "2026-11-13T12:02:00.000Z");
  assert.equal(plain.calls.release[0][5], 0);

  const last = await run(claimed({ attempts: 3 }), { kind: "retry", retryAfterSeconds: null, billedUnknown: false }, { release: "failed" });
  assert.deepEqual(last.body, { outcome: "failed" });
});

Deno.test("rejected releases tag_rejected at 0; refused/unreadable release at their actual cost", async () => {
  const rejected = await run(claimed(), { kind: "rejected" });
  assert.deepEqual(rejected.body, { outcome: "rejected" });
  assert.deepEqual(rejected.calls.release[0].slice(2), ["tag_rejected", null, null, 0]);

  for (const code of ["tag_refused", "tag_unreadable"] as const) {
    const { body, calls } = await run(claimed(), { kind: "fail", code, usage: USAGE });
    assert.deepEqual(body, { outcome: "failed" });
    const [, , error, retryAt, usage, cost] = calls.release[0];
    assert.equal(error, code);
    assert.equal(retryAt, null);
    assert.equal((usage as Record<string, number>).computedCostMicro, costMicro(MODEL, USAGE));
    assert.equal(cost, costMicro(MODEL, USAGE));
  }
});

Deno.test("a throw after the claim releases at the reservation and returns 500 with no detail", async () => {
  const { res, body, calls } = await run(claimed(), () => {
    throw new Error("The Salt Road leaked");
  });
  assert.equal(res.status, 500);
  assert.deepEqual(body, { error: "internal" });
  assert.equal(calls.release.length, 1);
  assert.deepEqual(calls.release[0].slice(2, 3), [null]);
  assert.equal(calls.release[0][5], TAG_RESERVE_MICRO);
});

Deno.test("42501 from the claim is 403, with no release", async () => {
  const { res, body, calls } = await run(() => {
    throw Object.assign(new Error("not_authorized"), { code: "42501" });
  }, { kind: "billing" });
  assert.equal(res.status, 403);
  assert.deepEqual(body, { error: "forbidden" });
  assert.equal(calls.release.length, 0);
});

Deno.test("method and body checks", async () => {
  const { db } = fakeDb(claimed());
  const { tagger } = fakeTag({ kind: "billing" });
  const deps = { db, tagger, fetchImpl: fakeFetch().fetchImpl, tosTagsUrl: tosUrl(), now: () => NOW };
  const get = await handle(new Request("http://localhost/x"), deps);
  assert.equal(get.status, 405);
  assert.equal((await handle(post({ jobId: "nope" }), deps)).status, 400);
  assert.equal((await handle(new Request("http://localhost/x", { method: "POST", body: "{" }), deps)).status, 400);
});

Deno.test("rpcDb maps the claim row and passes the finish and release arguments", async () => {
  const sent: { fn: string; args: Record<string, unknown> }[] = [];
  const supabase: SupabaseLike = {
    schema: () => ({
      rpc(fn, args) {
        sent.push({ fn, args });
        if (fn === "claim_tag_job") {
          return Promise.resolve({
            data: [{
              outcome: "claimed",
              claim_token: TOKEN,
              attempts: 2,
              kind: "full",
              book: { title: "Glass Orchard", authors: ["Member B"], seriesName: "Orchards", seriesVolume: 2.5, description: null, coverUrl: null },
              card: null,
              vocab: [{ id: "quest", category: "trope" }, { bad: true }],
              vocab_version: 3,
              removed: { tos: ["romance"], library: [] },
              tos_tags: ["fantasy"],
            }],
            error: null,
          });
        }
        return Promise.resolve({ data: fn === "finish_tag_job" ? "done" : "queued", error: null });
      },
    }),
  };
  const db = rpcDb(supabase);
  const claim = await db.claim(JOB);
  assert.deepEqual(claim, {
    outcome: "claimed",
    claimToken: TOKEN,
    attempts: 2,
    kind: "full",
    book: { title: "Glass Orchard", authors: ["Member B"], seriesName: "Orchards", seriesVolume: 2.5, description: null, coverUrl: null },
    card: null,
    vocab: [{ id: "quest", category: "trope" }],
    removed: { tos: ["romance"], library: [] },
  });
  const result: FinishResult = { tos: [], library: [], summary: "s", coverDescription: null, coverSeen: false, suggestions: [] };
  assert.equal(await db.finish(JOB, TOKEN, result, { a: 1 }, 5, MODEL), "done");
  assert.deepEqual(sent[1], {
    fn: "finish_tag_job",
    args: { p_job: JOB, p_claim: TOKEN, p_result: result, p_usage: { a: 1 }, p_cost_micro: 5, p_model: MODEL },
  });
  assert.equal(await db.release(JOB, TOKEN, null, NOW, null, 0), "queued");
  assert.deepEqual(sent[2], {
    fn: "release_tag_job",
    args: { p_job: JOB, p_claim: TOKEN, p_error: null, p_retry_at: NOW.toISOString(), p_usage: null, p_cost_micro: 0 },
  });
});

Deno.test("rpcDb: an RPC error is thrown with its code", async () => {
  const supabase: SupabaseLike = {
    schema: () => ({ rpc: () => Promise.resolve({ data: null, error: { code: "42501", message: "x" } }) }),
  };
  await assert.rejects(rpcDb(supabase).claim(JOB), (e: { code?: string }) => e.code === "42501");
});
