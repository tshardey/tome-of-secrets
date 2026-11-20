import assert from "node:assert/strict";
import { costMicro, type Usage } from "../_shared/library-ai.ts";
import { type Claim, type FinishResult, handle, rpcDb, type SupabaseLike, type TaggerDb } from "./handler.ts";
import type { TagInput, TagResult } from "./prompt.ts";
import { buildTagContent, TOS_TAG_CAP } from "./prompt.ts";
import { buildSeriesContent, type SeriesInput } from "./series.ts";
import { MODEL, type SeriesCall, SERIES_RESERVE_MICRO, TAG_RESERVE_MICRO, type TagCall, type Tagger } from "./tagger.ts";

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
      isbns: [],
    },
    card: null,
    vocab: [{ id: "found-family", category: "trope" }, { id: "cover-blue", category: "cover-colour" }],
    removed: { tos: [], library: [] },
    seriesNames: [],
    // A pre-Plan-11 claim row unless a test says otherwise (D1).
    sameAuthor: [],
    hasSameAuthorColumn: false,
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
      return Promise.resolve(opts.release ?? (args[2] && !["misconfigured", "billing", "tos_tags_unavailable"].includes(args[2] as string) ? "failed" : "queued"));
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
  series: null,
  series_status: "none",
};

function fakeTag(result: TagCall | (() => never), series: SeriesCall | (() => never) = { kind: "billing" }) {
  const inputs: TagInput[] = [];
  const seriesInputs: (SeriesInput & { allowSearch: boolean })[] = [];
  const tagger: Tagger = {
    tag(input) {
      inputs.push(input);
      return Promise.resolve(typeof result === "function" ? result() : result);
    },
    findSeries(input) {
      seriesInputs.push(input);
      return Promise.resolve(typeof series === "function" ? series() : series);
    },
  };
  return { tagger, inputs, seriesInputs };
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
  series?: SeriesCall | (() => never);
} = {}) {
  const { db, calls } = fakeDb(claim, opts);
  const { tagger, inputs, seriesInputs } = fakeTag(result, opts.series);
  const f = opts.fetch ?? fakeFetch();
  const res = await handle(post({ jobId: JOB }), {
    db,
    tagger,
    fetchImpl: f.fetchImpl,
    tosTagsUrl: tosUrl(),
    now: () => NOW,
  });
  return { res, body: await res.json(), calls, inputs, seriesInputs, urls: f.urls };
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

Deno.test("the ToS list failing releases tos_tags_unavailable (attempt given back) at cost 0, with no tag call", async () => {
  const { body, inputs, calls } = await run(claimed(), { kind: "ok", result: RESULT, usage: USAGE }, {
    fetch: fakeFetch({ tosStatus: 503 }),
  });
  assert.deepEqual(body, { outcome: "retry_later" });
  assert.equal(inputs.length, 0);
  assert.equal(calls.release.length, 1);
  const [id, token, error, retryAt, usage, cost] = calls.release[0];
  assert.equal(id, JOB);
  assert.equal(token, TOKEN);
  assert.equal(error, "tos_tags_unavailable");
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
    series: null,
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

Deno.test("a vocabulary id repeated by a household row is sent once", async () => {
  const vocab = [
    { id: "cover-sword", category: "cover-motif" },
    { id: "cover-sword", category: "cover-motif" },
    { id: "vampires", category: "creature" },
  ];
  const { inputs } = await run(claimed({ vocab }), { kind: "ok", result: RESULT, usage: USAGE });
  assert.deepEqual(inputs[0].vocab.map((v) => v.id), ["cover-sword", "vampires"]);
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
    book: { title: "Glass Orchard", authors: ["Member B"], seriesName: "Orchards", seriesVolume: 2.5, description: null, coverUrl: null, isbns: [] },
    card: null,
    vocab: [{ id: "quest", category: "trope" }],
    removed: { tos: ["romance"], library: [] },
    seriesNames: [],
    sameAuthor: [],
    hasSameAuthorColumn: false,
  });
  const result: FinishResult = {
    tos: [],
    library: [],
    summary: "s",
    coverDescription: null,
    coverSeen: false,
    suggestions: [],
    series: null,
  };
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

Deno.test("a blank summary on a full job releases tag_unreadable at its actual cost, with no finish", async () => {
  const { body, calls } = await run(claimed(), { kind: "ok", result: { ...RESULT, summary: "   " }, usage: USAGE });
  assert.deepEqual(body, { outcome: "failed" });
  assert.equal(calls.finish.length, 0);
  const [, , error, retryAt, usage, cost] = calls.release[0];
  assert.equal(error, "tag_unreadable");
  assert.equal(retryAt, null);
  assert.equal((usage as Record<string, number>).computedCostMicro, costMicro(MODEL, USAGE));
  assert.equal(cost, costMicro(MODEL, USAGE));
});

Deno.test("a blank summary on a new_tags job still finishes (the card stays)", async () => {
  const claim = claimed({ kind: "new_tags", card: { summary: "A short card.", coverDescription: null } });
  const { body, calls } = await run(claim, { kind: "ok", result: { ...RESULT, summary: "" }, usage: USAGE });
  assert.deepEqual(body, { outcome: "done" });
  assert.equal(calls.finish.length, 1);
});

const sugg = (id: string) => ({ id, label: "Some label", category: "setting", why: "A reason." });

Deno.test("a suggestion equal to any ToS id in the list is dropped, on both job kinds", async () => {
  const result = { ...RESULT, suggestions: [sugg("special-edition"), sugg("audio"), sugg("salt-flats")] };
  const full = await run(claimed(), { kind: "ok", result, usage: USAGE });
  assert.deepEqual((full.calls.finish[0][2] as FinishResult).suggestions.map((s) => s.id), ["salt-flats"]);

  const newTags = claimed({ kind: "new_tags", card: { summary: "A short card.", coverDescription: null } });
  const nt = await run(newTags, { kind: "ok", result: { ...result, suggestions: [sugg("fantasy"), sugg("salt-flats")] }, usage: USAGE });
  assert.deepEqual((nt.calls.finish[0][2] as FinishResult).suggestions.map((s) => s.id), ["salt-flats"]);
});

Deno.test("a ToS id past the 120-id clamp is still refused as a suggestion", async () => {
  const big = Array.from({ length: 200 }, (_, i) => ({ id: `genre-${i}`, label: `Genre ${i}`, category: "genre" }));
  const { calls, inputs } = await run(claimed(), {
    kind: "ok",
    result: { ...RESULT, suggestions: [sugg("genre-150"), sugg("salt-flats")] },
    usage: USAGE,
  }, { fetch: fakeFetch({ tosList: big }) });
  assert.ok(!inputs[0].tosTags.includes("genre-150"));
  assert.deepEqual((calls.finish[0][2] as FinishResult).suggestions.map((s) => s.id), ["salt-flats"]);
});

// ---------------------------------------------------------------------------
// Plan 10: the household series names, the series result, series claims
// ---------------------------------------------------------------------------

const SERIES_NAMES = ["Lantern Vale", "Thornmere Cycle"];
const CARD = { summary: "A keeper lights the last lamp.", coverDescription: "A lamp on a hill." };

Deno.test("a full claim's series names reach the tagger (and so the household block)", async () => {
  const { inputs } = await run(claimed({ seriesNames: SERIES_NAMES }), { kind: "ok", result: RESULT, usage: USAGE });
  assert.deepEqual(inputs[0].seriesNames, SERIES_NAMES);
  const content = buildTagContent(inputs[0]) as { text?: string; cache_control?: unknown }[];
  assert.ok(content.some((b) => b.cache_control && b.text?.startsWith("Household series") && b.text.includes("Lantern Vale")));
});

Deno.test("a full ok finishes with the series cleaned; a placeholder name becomes null", async () => {
  const named = await run(claimed(), {
    kind: "ok",
    result: { ...RESULT, series_status: "found", series: { name: "  Lantern Vale ", volume: 1, why: "The title numbers it." } },
    usage: USAGE,
  });
  assert.deepEqual((named.calls.finish[0][2] as FinishResult).series, { name: "Lantern Vale", volume: 1, why: "The title numbers it." });
  const standalone = await run(claimed(), {
    kind: "ok",
    result: { ...RESULT, series_status: "found", series: { name: "Standalone", volume: null, why: "x" } },
    usage: USAGE,
  });
  const result = standalone.calls.finish[0][2] as FinishResult;
  assert.ok("series" in result);
  assert.equal(result.series, null);
});

Deno.test("rpcDb: series_names maps to seriesNames, and a series kind reads as series", async () => {
  const row = (extra: Record<string, unknown>) => ({
    outcome: "claimed",
    claim_token: TOKEN,
    attempts: 1,
    kind: "series",
    book: { title: "Lantern Vale #1", authors: [], seriesName: null, seriesVolume: null, description: null, coverUrl: null },
    card: CARD,
    vocab: [],
    removed: { tos: [], library: [] },
    ...extra,
  });
  const db = (r: Record<string, unknown>) => rpcDb({ schema: () => ({ rpc: () => Promise.resolve({ data: [r], error: null }) }) });
  const withNames = await db(row({ series_names: ["Lantern Vale", 7, "Ember Loom"] })).claim(JOB);
  assert.equal(withNames.kind, "series");
  assert.deepEqual(withNames.seriesNames, ["Lantern Vale", "Ember Loom"]);
  const without = await db(row({})).claim(JOB);
  assert.deepEqual(without.seriesNames, []);
});

Deno.test("a claim row without series_names sends no household block and still finishes", async () => {
  const supabase: SupabaseLike = {
    schema: () => ({
      rpc(fn) {
        if (fn === "claim_tag_job") {
          return Promise.resolve({
            data: [{
              outcome: "claimed",
              claim_token: TOKEN,
              attempts: 1,
              kind: "full",
              book: { title: "The Salt Road", authors: ["Member A"], seriesName: null, seriesVolume: null, description: "d", coverUrl: null },
              card: null,
              vocab: [{ id: "found-family", category: "trope" }],
              removed: { tos: [], library: [] },
            }],
            error: null,
          });
        }
        return Promise.resolve({ data: "done", error: null });
      },
    }),
  };
  const { tagger, inputs } = fakeTag({ kind: "ok", result: RESULT, usage: USAGE });
  const res = await handle(post({ jobId: JOB }), {
    db: rpcDb(supabase),
    tagger,
    fetchImpl: fakeFetch().fetchImpl,
    tosTagsUrl: tosUrl(),
    now: () => NOW,
  });
  assert.deepEqual(await res.json(), { outcome: "done" });
  assert.deepEqual(inputs[0].seriesNames, []);
  const content = buildTagContent(inputs[0]) as { text?: string }[];
  assert.ok(!content.some((b) => b.text?.startsWith("Household series")));
});

const seriesClaim = (over: Partial<Claim> = {}) =>
  claimed({
    kind: "series",
    card: CARD,
    vocab: [],
    seriesNames: SERIES_NAMES,
    book: { ...claimed().book!, title: "Lantern Vale #1" },
    ...over,
  });

Deno.test("a series claim calls findSeries only, fetches nothing, and finishes with series and the cost", async () => {
  const series = { name: "Lantern Vale", volume: 1, why: "The title numbers it." };
  const { body, inputs, seriesInputs, urls, calls } = await run(
    seriesClaim(),
    () => {
      throw new Error("tag must not be called");
    },
    { series: { kind: "ok", status: "found", series, usage: USAGE, searched: false } },
  );
  assert.deepEqual(body, { outcome: "done" });
  assert.equal(inputs.length, 0);
  assert.equal(urls.length, 0); // no ToS list, no cover
  assert.deepEqual(seriesInputs, [{
    title: "Lantern Vale #1",
    authors: ["Member A"],
    description: claimed().book!.description,
    card: CARD,
    seriesNames: SERIES_NAMES,
    sameAuthor: [],
    openLibrary: [],
    allowSearch: false,
  }]);
  const [, , result, usage, cost, model] = calls.finish[0] as [string, string, FinishResult, Record<string, number>, number, string];
  assert.deepEqual(result, {
    tos: [],
    library: [],
    summary: null,
    coverDescription: null,
    coverSeen: false,
    suggestions: [],
    series,
  });
  assert.equal(cost, costMicro(MODEL, USAGE));
  assert.equal(usage.computedCostMicro, costMicro(MODEL, USAGE));
  assert.equal(model, MODEL);
});

Deno.test("a series ok with a placeholder still finishes with series null (the book is marked checked)", async () => {
  const { calls } = await run(seriesClaim(), { kind: "billing" }, {
    series: { kind: "ok", status: "found", series: { name: "unknown", volume: null, why: "" }, usage: USAGE, searched: false },
  });
  const result = calls.finish[0][2] as FinishResult;
  assert.ok("series" in result);
  assert.equal(result.series, null);
});

Deno.test("a series retry billed unknown releases at SERIES_RESERVE_MICRO; a plain retry at 0", async () => {
  const unknown = await run(seriesClaim(), { kind: "billing" }, {
    series: { kind: "retry", retryAfterSeconds: null, billedUnknown: true },
  });
  assert.deepEqual(unknown.body, { outcome: "retry_later" });
  assert.equal(unknown.calls.release[0][2], null);
  assert.equal(unknown.calls.release[0][5], SERIES_RESERVE_MICRO);
  const plain = await run(seriesClaim(), { kind: "billing" }, {
    series: { kind: "retry", retryAfterSeconds: 5, billedUnknown: false },
  });
  assert.equal(plain.calls.release[0][5], 0);
});

Deno.test("series failures release as tagging does", async () => {
  for (const kind of ["billing", "misconfigured"] as const) {
    const { body, calls } = await run(seriesClaim(), { kind: "ok", result: RESULT, usage: USAGE }, { series: { kind } });
    assert.deepEqual(body, { outcome: kind });
    assert.deepEqual(calls.release[0].slice(2), [kind, null, null, 0]);
  }
  const rejected = await run(seriesClaim(), { kind: "billing" }, { series: { kind: "rejected" } });
  assert.deepEqual(rejected.calls.release[0].slice(2), ["tag_rejected", null, null, 0]);
  for (const code of ["tag_refused", "tag_unreadable"] as const) {
    const { body, calls } = await run(seriesClaim(), { kind: "billing" }, { series: { kind: "fail", code, usage: USAGE } });
    assert.deepEqual(body, { outcome: "failed" });
    assert.equal(calls.release[0][2], code);
    assert.equal(calls.release[0][5], costMicro(MODEL, USAGE));
  }
});

Deno.test("a throw after a series claim releases at SERIES_RESERVE_MICRO and returns 500", async () => {
  const { res, body, calls } = await run(seriesClaim(), { kind: "billing" }, {
    series: () => {
      throw new Error("Lantern Vale leaked");
    },
  });
  assert.equal(res.status, 500);
  assert.deepEqual(body, { error: "internal" });
  assert.equal(calls.release.length, 1);
  assert.equal(calls.release[0][2], null);
  assert.equal(calls.release[0][5], SERIES_RESERVE_MICRO);
});

// ---------------------------------------------------------------------------
// Plan 11: same-author books, Open Library, the series status and search (D1, D6, D8, D9, D10)
// ---------------------------------------------------------------------------

// Invented ISBNs with a deliberately wrong check digit.
const ISBN_A = "9781234567890";
const ISBN_B = "9781234567807";
const SAME_AUTHOR = [
  { title: "Lantern Vale Cycle #1", seriesName: "Lantern Vale Cycle", seriesVolume: 1 },
  { title: "Saltglass", seriesName: null, seriesVolume: null },
];
const OL_SERIES = ["Lantern Vale Cycle"];

/** fakeFetch plus Open Library: `ol` decides each openlibrary.org answer. */
function olFetch(ol: (url: string, init?: RequestInit) => Promise<Response>) {
  const base = fakeFetch();
  const fetchImpl = ((input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    if (url.startsWith("https://openlibrary.org/")) {
      base.urls.push(url);
      return ol(url, init);
    }
    return base.fetchImpl(input, init);
  }) as typeof fetch;
  return { fetchImpl, urls: base.urls };
}
const olOk = () => olFetch(() => Promise.resolve(Response.json({ series: OL_SERIES })));

const withEvidence = (over: Partial<Claim> = {}) =>
  claimed({
    sameAuthor: SAME_AUTHOR,
    hasSameAuthorColumn: true,
    book: { ...claimed().book!, isbns: [ISBN_A, ISBN_B] },
    ...over,
  });

Deno.test("a full claim sends the same-author block and the Open Library line, and finishes with seriesStatus", async () => {
  const f = olOk();
  const { body, inputs, calls, urls } = await run(withEvidence(), {
    kind: "ok",
    result: { ...RESULT, series: { name: "Lantern Vale Cycle", volume: 2, why: "Same author, numbered." }, series_status: "found" },
    usage: USAGE,
  }, { fetch: f });
  assert.deepEqual(body, { outcome: "done" });
  assert.deepEqual(urls.filter((u) => u.startsWith("https://openlibrary.org/")), [`https://openlibrary.org/isbn/${ISBN_A}.json`]);
  assert.deepEqual(inputs[0].sameAuthor, SAME_AUTHOR);
  assert.deepEqual(inputs[0].openLibrary, OL_SERIES);
  const text = (buildTagContent(inputs[0]) as { text?: string }[]).map((b) => b.text ?? "").join("\n");
  assert.ok(text.includes("Household books by the same author"));
  assert.ok(text.includes("Lantern Vale Cycle #1 | Lantern Vale Cycle #1"));
  assert.ok(text.includes("Open Library lists: <openlibrary>Lantern Vale Cycle</openlibrary>"));
  const result = calls.finish[0][2] as FinishResult;
  assert.equal(result.seriesStatus, "found");
  assert.deepEqual(result.series, { name: "Lantern Vale Cycle", volume: 2, why: "Same author, numbered." });
});

Deno.test("an unsure full result finishes with series null and seriesStatus unsure", async () => {
  const { calls } = await run(withEvidence(), {
    kind: "ok",
    result: { ...RESULT, series: { name: "Lantern Vale Cycle", volume: 2, why: "Maybe." }, series_status: "unsure" },
    usage: USAGE,
  }, { fetch: olOk() });
  const result = calls.finish[0][2] as FinishResult;
  assert.equal(result.series, null);
  assert.equal(result.seriesStatus, "unsure");
});

Deno.test("a full job never searches: tag() is the only call, and findSeries is not made", async () => {
  const { seriesInputs, inputs } = await run(withEvidence(), {
    kind: "ok",
    result: { ...RESULT, series_status: "unsure" },
    usage: USAGE,
  }, { fetch: olOk() });
  assert.equal(inputs.length, 1);
  assert.equal(seriesInputs.length, 0);
});

Deno.test("a series claim with the same_author column searches when unsure, finishing at the summed, uncapped cost", async () => {
  // Over the reservation on purpose: a series job records its true cost (D10).
  const big: Usage = { inputTokens: 60_000, outputTokens: 2_000, cacheCreationTokens: 0, cacheReadTokens: 4_000, webSearchRequests: 2 };
  assert.ok(costMicro(MODEL, big) > SERIES_RESERVE_MICRO);
  const series = { name: "Lantern Vale Cycle", volume: 2, why: "The publisher's page numbers it." };
  const { body, seriesInputs, calls, urls } = await run(
    seriesClaim({ sameAuthor: SAME_AUTHOR, hasSameAuthorColumn: true, book: { ...seriesClaim().book!, isbns: [ISBN_A] } }),
    { kind: "billing" },
    { fetch: olOk(), series: { kind: "ok", status: "found", series, usage: big, searched: true } },
  );
  assert.deepEqual(body, { outcome: "done" });
  assert.deepEqual(urls, [`https://openlibrary.org/isbn/${ISBN_A}.json`]); // no ToS list, no cover
  assert.equal(seriesInputs[0].allowSearch, true);
  assert.deepEqual(seriesInputs[0].sameAuthor, SAME_AUTHOR);
  assert.deepEqual(seriesInputs[0].openLibrary, OL_SERIES);
  const [, , result, usage, cost] = calls.finish[0] as [string, string, FinishResult, Record<string, number>, number];
  assert.deepEqual(result.series, series);
  assert.equal(result.seriesStatus, "found");
  assert.equal(cost, costMicro(MODEL, big));
  assert.equal(cost, costMicro(MODEL, { ...big, webSearchRequests: 0 }) + 20_000);
  assert.equal(usage.webSearchRequests, 2);
  assert.equal(usage.computedCostMicro, cost);
});

Deno.test("a series result is cleaned: found with a placeholder reads none; unsure drops the series", async () => {
  const placeholder = await run(seriesClaim({ hasSameAuthorColumn: true }), { kind: "billing" }, {
    series: { kind: "ok", status: "found", series: { name: "unknown", volume: null, why: "" }, usage: USAGE, searched: false },
  });
  const r1 = placeholder.calls.finish[0][2] as FinishResult;
  assert.equal(r1.series, null);
  assert.equal(r1.seriesStatus, "none");
  const unsure = await run(seriesClaim({ hasSameAuthorColumn: true }), { kind: "billing" }, {
    series: { kind: "ok", status: "unsure", series: { name: "Ember Loom", volume: 1, why: "A guess." }, usage: USAGE, searched: true },
  });
  const r2 = unsure.calls.finish[0][2] as FinishResult;
  assert.ok("series" in r2);
  assert.equal(r2.series, null);
  assert.equal(r2.seriesStatus, "unsure");
});

Deno.test("D1: a claim row without same_author never searches and sends no seriesStatus", async () => {
  const row = (kind: string) => ({
    outcome: "claimed",
    claim_token: TOKEN,
    attempts: 1,
    kind,
    book: { title: "Lantern Vale Cycle #2", authors: ["Tj Holt"], seriesName: null, seriesVolume: null, description: "d", coverUrl: null },
    card: CARD,
    vocab: [{ id: "found-family", category: "trope" }],
    removed: { tos: [], library: [] },
    series_names: SERIES_NAMES,
  });
  for (const kind of ["series", "full"]) {
    const finishes: Record<string, unknown>[] = [];
    const supabase: SupabaseLike = {
      schema: () => ({
        rpc(fn, args) {
          if (fn === "claim_tag_job") return Promise.resolve({ data: [row(kind)], error: null });
          finishes.push(args.p_result as Record<string, unknown>);
          return Promise.resolve({ data: "done", error: null });
        },
      }),
    };
    const { tagger, seriesInputs } = fakeTag(
      { kind: "ok", result: { ...RESULT, series_status: "unsure" }, usage: USAGE },
      { kind: "ok", status: "unsure", series: null, usage: USAGE, searched: false },
    );
    const res = await handle(post({ jobId: JOB }), {
      db: rpcDb(supabase),
      tagger,
      fetchImpl: fakeFetch().fetchImpl,
      tosTagsUrl: tosUrl(),
      now: () => NOW,
    });
    assert.deepEqual(await res.json(), { outcome: "done" }, kind);
    if (kind === "series") assert.equal(seriesInputs[0].allowSearch, false);
    assert.equal(finishes.length, 1, kind);
    assert.ok(!("seriesStatus" in finishes[0]), kind);
    assert.ok("series" in finishes[0], kind);
  }
});

Deno.test("rpcDb: same_author and isbns are read defensively; the column's presence is recorded", async () => {
  const db = (extra: Record<string, unknown>, isbns?: unknown) =>
    rpcDb({
      schema: () => ({
        rpc: () =>
          Promise.resolve({
            data: [{
              outcome: "claimed",
              claim_token: TOKEN,
              attempts: 1,
              kind: "series",
              book: {
                title: "Lantern Vale Cycle #2",
                authors: ["Tj Holt"],
                seriesName: null,
                seriesVolume: null,
                description: null,
                coverUrl: null,
                ...(isbns === undefined ? {} : { isbns }),
              },
              card: null,
              vocab: [],
              removed: { tos: [], library: [] },
              ...extra,
            }],
            error: null,
          }),
      }),
    });
  const claim = await db({
    same_author: [
      { title: "Lantern Vale Cycle #1", seriesName: "Lantern Vale Cycle", seriesVolume: 1 },
      { title: 7, seriesName: "Ember Loom", seriesVolume: 1 },
      { title: "  ", seriesName: null, seriesVolume: null },
      { title: "Wrenfold", seriesName: 3, seriesVolume: "2" },
      { title: "Thornmere", seriesName: "Thornmere Cycle", seriesVolume: Number.NaN },
      "not a row",
      null,
    ],
  }, [ISBN_A, 5, ISBN_B]).claim(JOB);
  assert.equal(claim.hasSameAuthorColumn, true);
  assert.deepEqual(claim.sameAuthor, [
    { title: "Lantern Vale Cycle #1", seriesName: "Lantern Vale Cycle", seriesVolume: 1 },
    { title: "Wrenfold", seriesName: null, seriesVolume: null },
    { title: "Thornmere", seriesName: "Thornmere Cycle", seriesVolume: null },
  ]);
  assert.deepEqual(claim.book?.isbns, [ISBN_A, ISBN_B]);

  const nulled = await db({ same_author: null }).claim(JOB);
  assert.equal(nulled.hasSameAuthorColumn, true);
  assert.deepEqual(nulled.sameAuthor, []);
  const old = await db({}).claim(JOB);
  assert.equal(old.hasSameAuthorColumn, false);
  assert.deepEqual(old.sameAuthor, []);
  assert.deepEqual(old.book?.isbns, []);
});

Deno.test("Review Focus 3: Open Library throwing, timing out or returning HTML -> the job finishes with no Open Library line", async () => {
  const failures: [string, ReturnType<typeof olFetch>][] = [
    ["throws", olFetch(() => Promise.reject(new TypeError("network down")))],
    ["html", olFetch(() => Promise.resolve(new Response("<html>busy</html>", { status: 200, headers: { "content-type": "text/html" } })))],
    ["404", olFetch(() => Promise.resolve(new Response("no", { status: 404 })))],
    [
      "timeout",
      olFetch((_u, init) =>
        new Promise<Response>((_resolve, reject) => {
          init?.signal?.addEventListener("abort", () => reject(new DOMException("timed out", "TimeoutError")));
        })
      ),
    ],
  ];
  for (const [name, f] of failures) {
    for (const kind of ["full", "series"] as const) {
      const claim = kind === "full" ? withEvidence() : seriesClaim({ hasSameAuthorColumn: true, book: { ...seriesClaim().book!, isbns: [ISBN_A] } });
      const { body, inputs, seriesInputs, calls } = await run(claim, { kind: "ok", result: RESULT, usage: USAGE }, {
        fetch: f,
        series: { kind: "ok", status: "none", series: null, usage: USAGE, searched: false },
      });
      const label = `${name} ${kind}`;
      assert.deepEqual(body, { outcome: "done" }, label);
      assert.equal(calls.finish.length, 1, label);
      const sent = kind === "full" ? inputs[0] : seriesInputs[0];
      assert.deepEqual(sent.openLibrary, [], label);
      const content = kind === "full" ? buildTagContent(inputs[0]) : buildSeriesContent(seriesInputs[0]);
      assert.ok(!(content as { text?: string }[]).some((b) => b.text?.includes("Open Library lists")), label);
    }
  }
});

Deno.test("new_tags makes no Open Library lookup", async () => {
  const f = olOk();
  const claim = withEvidence({ kind: "new_tags", card: { summary: "A short card.", coverDescription: null } });
  const { body, urls } = await run(claim, { kind: "ok", result: RESULT, usage: USAGE }, { fetch: f });
  assert.deepEqual(body, { outcome: "done" });
  assert.ok(!urls.some((u) => u.startsWith("https://openlibrary.org/")));
});

Deno.test("a billed-unknown search finishes unsure at no less than SERIES_RESERVE_MICRO, logging the code only", async () => {
  const logged: unknown[][] = [];
  const original = console.error;
  console.error = (...args: unknown[]) => void logged.push(args);
  try {
    const { body, calls } = await run(seriesClaim({ hasSameAuthorColumn: true }), { kind: "billing" }, {
      series: { kind: "ok", status: "unsure", series: null, usage: USAGE, searched: true, searchFailure: "billed_unknown" },
    });
    assert.deepEqual(body, { outcome: "done" });
    const [, , result, , cost] = calls.finish[0] as [string, string, FinishResult, unknown, number];
    assert.equal(result.seriesStatus, "unsure");
    assert.equal(cost, Math.max(costMicro(MODEL, USAGE), SERIES_RESERVE_MICRO));
    assert.equal(calls.release.length, 0);

    const unbilled = await run(seriesClaim({ hasSameAuthorColumn: true }), { kind: "billing" }, {
      series: { kind: "ok", status: "unsure", series: null, usage: USAGE, searched: true, searchFailure: "rejected" },
    });
    assert.equal(unbilled.calls.finish[0][4], costMicro(MODEL, USAGE));
  } finally {
    console.error = original;
  }
  assert.deepEqual(logged, [["library-tagger search failed", "billed_unknown"], ["library-tagger search failed", "rejected"]]);
});
