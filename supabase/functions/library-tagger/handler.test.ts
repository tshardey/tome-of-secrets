import assert from "node:assert/strict";
import { costMicro, type Usage } from "../_shared/library-ai.ts";
import { type Claim, type FinishResult, handle, rpcDb, type SupabaseLike, type TaggerDb } from "./handler.ts";
import type { TagInput, TagResult } from "./prompt.ts";
import { buildTagContent, TOS_TAG_CAP } from "./prompt.ts";
import { buildSeriesContent, type SeriesInput } from "./series.ts";
import { type AuditInput, buildAuditContent } from "./audit.ts";
import {
  type AuditCall,
  MODEL,
  type SeriesCall,
  SERIES_RESERVE_MICRO,
  TAG_RESERVE_MICRO,
  type TagCall,
  type Tagger,
  type Unreadable,
} from "./tagger.ts";

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

function fakeDb(claim: Claim | (() => never), opts: { finish?: string; release?: string; audit?: Claim | (() => never) } = {}) {
  const calls = { claim: [] as string[], claimAudit: [] as string[], finish: [] as unknown[][], release: [] as unknown[][] };
  const db: TaggerDb = {
    claim(id) {
      calls.claim.push(id);
      return Promise.resolve(typeof claim === "function" ? claim() : claim);
    },
    claimAudit(id) {
      calls.claimAudit.push(id);
      const audit = opts.audit;
      if (!audit) throw new Error("claimAudit must not be called");
      return Promise.resolve(typeof audit === "function" ? audit() : audit);
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

function fakeTag(
  result: TagCall | (() => never),
  series: SeriesCall | (() => never) = { kind: "billing" },
  audit: AuditCall | (() => never) = { kind: "billing" },
) {
  const inputs: TagInput[] = [];
  const seriesInputs: (SeriesInput & { allowSearch: boolean })[] = [];
  const auditInputs: (AuditInput & { allowSearch: boolean })[] = [];
  const tagger: Tagger = {
    auditSeries(input) {
      auditInputs.push(input);
      return Promise.resolve(typeof audit === "function" ? audit() : audit);
    },
    tag(input) {
      inputs.push(input);
      return Promise.resolve(typeof result === "function" ? result() : result);
    },
    findSeries(input) {
      seriesInputs.push(input);
      return Promise.resolve(typeof series === "function" ? series() : series);
    },
  };
  return { tagger, inputs, seriesInputs, auditInputs };
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
  audit?: AuditCall | (() => never);
  auditClaim?: Claim | (() => never);
} = {}) {
  const { db, calls } = fakeDb(claim, { ...opts, audit: opts.auditClaim });
  const { tagger, inputs, seriesInputs, auditInputs } = fakeTag(result, opts.series, opts.audit);
  const f = opts.fetch ?? fakeFetch();
  const res = await handle(post({ jobId: JOB }), {
    db,
    tagger,
    fetchImpl: f.fetchImpl,
    tosTagsUrl: tosUrl(),
    now: () => NOW,
  });
  return { res, body: await res.json(), calls, inputs, seriesInputs, auditInputs, urls: f.urls };
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
    { title: "Lantern Vale Cycle #1", seriesName: "Lantern Vale Cycle", seriesVolume: 1, handSet: false },
    { title: "Wrenfold", seriesName: null, seriesVolume: null, handSet: false },
    { title: "Thornmere", seriesName: "Thornmere Cycle", seriesVolume: null, handSet: false },
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

  } finally {
    console.error = original;
  }
  assert.deepEqual(logged, [["library-tagger search failed", "billed_unknown"]]);
});

Deno.test("an unbilled search-call failure releases at the first call's cost: no finish, so the book keeps its search", async () => {
  const first: Usage = { inputTokens: 3000, outputTokens: 200, cacheCreationTokens: 0, cacheReadTokens: 1000 };
  const spent = costMicro(MODEL, first);
  assert.ok(spent > 0 && spent < SERIES_RESERVE_MICRO);
  const claim = () => seriesClaim({ hasSameAuthorColumn: true, attempts: 1 });

  // 429 / 5xx: requeued with backoff within the attempts, at the first call's cost.
  const retry = await run(claim(), { kind: "billing" }, {
    series: { kind: "retry", retryAfterSeconds: 7, billedUnknown: false, usage: first },
  });
  assert.deepEqual(retry.body, { outcome: "retry_later" });
  assert.equal(retry.calls.finish.length, 0);
  const [, , error, retryAt, usage, cost] = retry.calls.release[0];
  assert.equal(error, null);
  assert.ok(retryAt instanceof Date);
  assert.equal((usage as Record<string, number>).computedCostMicro, spent);
  assert.equal(cost, spent);

  // 400: fails visibly as tag_rejected, at the first call's cost.
  const rejected = await run(claim(), { kind: "billing" }, { series: { kind: "rejected", usage: first } });
  assert.deepEqual(rejected.body, { outcome: "rejected" });
  assert.equal(rejected.calls.finish.length, 0);
  assert.equal(rejected.calls.release[0][2], "tag_rejected");
  assert.equal(rejected.calls.release[0][5], spent);

  // billing / misconfigured: released as before (SQL gives the attempt back at 0), usage kept.
  for (const kind of ["billing", "misconfigured"] as const) {
    const r = await run(claim(), { kind: "billing" }, { series: { kind, usage: first } });
    assert.deepEqual(r.body, { outcome: kind });
    assert.equal(r.calls.finish.length, 0);
    assert.equal(r.calls.release[0][2], kind);
    assert.equal((r.calls.release[0][4] as Record<string, number>).computedCostMicro, spent);
  }

  // Without a first call (single mode, or a plain failure), the release is as it always was.
  const plain = await run(claim(), { kind: "billing" }, { series: { kind: "retry", retryAfterSeconds: 7, billedUnknown: false } });
  assert.equal(plain.calls.release[0][4], null);
  assert.equal(plain.calls.release[0][5], 0);
});

// 2026-11-22: why a reply could not be read is stored with the usage and logged, with no book text.
const WHY_UNREADABLE: Unreadable = {
  reason: "schema",
  blocks: ["thinking", "text"],
  textChars: 47,
  stopReason: "end_turn",
  issues: [{ path: "series_status", code: "invalid_value" }],
};

async function logging<T>(fn: () => Promise<T>): Promise<{ value: T; logged: unknown[][] }> {
  const logged: unknown[][] = [];
  const original = console.error;
  console.error = (...args: unknown[]) => void logged.push(args);
  try {
    return { value: await fn(), logged };
  } finally {
    console.error = original;
  }
}

Deno.test("unreadable: a tag or series release stores the reason with the usage and logs one line", async () => {
  const fail = { kind: "fail", code: "tag_unreadable", usage: USAGE, unreadable: WHY_UNREADABLE } as const;
  for (const r of [() => run(claimed(), fail), () => run(seriesClaim(), { kind: "billing" }, { series: fail })]) {
    const { value, logged } = await logging(r);
    assert.deepEqual(value.body, { outcome: "failed" });
    const usage = value.calls.release[0][4] as Record<string, unknown>;
    assert.deepEqual(usage, { ...USAGE, computedCostMicro: costMicro(MODEL, USAGE), unreadable: WHY_UNREADABLE });
    assert.deepEqual(logged, [["library-tagger unreadable", JSON.stringify(WHY_UNREADABLE)]]);
    assert.ok(!JSON.stringify(logged).includes("Lantern"));
  }
  // Without a reason (an empty summary, or an older reply), the usage is as before and nothing is logged.
  const { value, logged } = await logging(() => run(claimed(), { kind: "fail", code: "tag_unreadable", usage: USAGE }));
  assert.equal("unreadable" in (value.calls.release[0][4] as Record<string, unknown>), false);
  assert.equal(logged.length, 0);
});

Deno.test("unreadable: a series check that searched after an unreadable first reply finishes and keeps the reason", async () => {
  const { value, logged } = await logging(() =>
    run(seriesClaim({ hasSameAuthorColumn: true }), { kind: "billing" }, {
      series: { kind: "ok", status: "unsure", series: null, usage: USAGE, searched: true, unreadable: WHY_UNREADABLE },
    })
  );
  assert.deepEqual(value.body, { outcome: "done" });
  const usage = value.calls.finish[0][3] as Record<string, unknown>;
  assert.deepEqual(usage.unreadable, WHY_UNREADABLE);
  assert.equal(usage.computedCostMicro, costMicro(MODEL, USAGE));
  assert.deepEqual(logged, [["library-tagger unreadable", JSON.stringify(WHY_UNREADABLE)]]);
  // An unbilled search failure after it releases with the first call's usage and the reason.
  const retry = await logging(() =>
    run(seriesClaim({ hasSameAuthorColumn: true }), { kind: "billing" }, {
      series: { kind: "retry", retryAfterSeconds: null, billedUnknown: false, usage: USAGE, unreadable: WHY_UNREADABLE },
    })
  );
  assert.deepEqual((retry.value.calls.release[0][4] as Record<string, unknown>).unreadable, WHY_UNREADABLE);
  assert.equal(retry.logged.length, 1);
});

// ---------------------------------------------------------------------------
// Plan 12: the series audit (D4, D5, D10)
// ---------------------------------------------------------------------------

const AUDIT_NAMES = ["Ember Loom", "Thornmere Cycle", "Saltglass Archive"];
const AUDIT_BOOK = {
  title: "Ember Loom #4",
  authors: ["Petra Wynnecombe"],
  seriesName: "Ember Loom",
  seriesVolume: 2,
  description: "The fourth book of Ember Loom.",
  coverUrl: COVER,
  isbns: [],
};
const NEIGHBOURS = [
  { title: "Ember Loom #1", seriesName: "Ember Loom", seriesVolume: 1, handSet: true },
  { title: "Wrenfold", seriesName: null, seriesVolume: null, handSet: false },
];
/** claim_tag_job's answer for an audit job (D4): outcome audit, everything else null. */
const auditGate = () => claimed({ outcome: "audit", claimToken: null, attempts: 0, book: null, vocab: [] });
const auditClaim = (over: Partial<Claim> = {}) =>
  claimed({
    kind: "audit",
    book: AUDIT_BOOK,
    card: CARD,
    vocab: [],
    seriesNames: AUDIT_NAMES,
    sameAuthor: NEIGHBOURS,
    hasSameAuthorColumn: true,
    ...over,
  });
const AUDIT_BASE = { tos: [], library: [], summary: null, coverDescription: null, coverSeen: false, suggestions: [] };
const never = (what: string) => () => {
  throw new Error(`${what} must not be called`);
};
const auditOk = (
  result: { verdict: "agree" | "wrong_series" | "wrong_number" | "unsure"; name: string | null; volume: number | null; why: string },
  over: Partial<Extract<AuditCall, { kind: "ok" }>> = {},
): AuditCall => ({ kind: "ok", verdict: result.verdict, result, usage: USAGE, searched: false, ...over });

function runAudit(call: AuditCall | (() => never), opts: Parameters<typeof run>[2] = {}) {
  return run(auditGate(), never("tag"), { series: never("findSeries"), auditClaim: auditClaim(), audit: call, ...opts });
}

Deno.test("audit agree: claimAudit once, then auditSeries; the finish has audit, no series key, at the true uncapped cost", async () => {
  const big: Usage = { inputTokens: 60_000, outputTokens: 2_000, cacheCreationTokens: 0, cacheReadTokens: 4_000, webSearchRequests: 2 };
  assert.ok(costMicro(MODEL, big) > SERIES_RESERVE_MICRO);
  const { body, calls, inputs, seriesInputs, auditInputs, urls } = await runAudit(
    auditOk({ verdict: "agree", name: null, volume: null, why: "  The title matches.  " }, { usage: big, searched: true }),
  );
  assert.deepEqual(body, { outcome: "done" });
  assert.deepEqual(calls.claim, [JOB]);
  assert.deepEqual(calls.claimAudit, [JOB]);
  assert.equal(inputs.length + seriesInputs.length, 0);
  assert.equal(urls.length, 0); // no ToS list, no cover, no ISBNs
  assert.deepEqual(auditInputs, [{
    title: "Ember Loom #4",
    authors: ["Petra Wynnecombe"],
    description: AUDIT_BOOK.description,
    card: CARD,
    seriesNames: AUDIT_NAMES,
    openLibrary: [],
    recorded: { name: "Ember Loom", volume: 2 },
    neighbours: NEIGHBOURS,
    allowSearch: true,
  }]);
  const [id, token, result, usage, cost, model] = calls.finish[0] as [string, string, FinishResult, Record<string, number>, number, string];
  assert.equal(id, JOB);
  assert.equal(token, TOKEN);
  assert.deepEqual(result, { ...AUDIT_BASE, audit: { verdict: "agree", name: null, volume: null, why: "The title matches." } });
  assert.ok(!("series" in result) && !("seriesStatus" in result));
  assert.equal(cost, costMicro(MODEL, big));
  assert.equal(usage.computedCostMicro, cost);
  assert.equal(usage.webSearchRequests, 2);
  assert.equal(model, MODEL);
});

Deno.test("audit verdicts: each finish payload carries the answer as cleanAudit leaves it", async () => {
  const cases: [string, Parameters<typeof auditOk>[0], Claim, unknown][] = [
    [
      "spelling only: sent as cleaned, the server guard decides",
      { verdict: "wrong_series", name: "  the thornmere cycle ", volume: 3, why: "Spelt differently." },
      auditClaim({ book: { ...AUDIT_BOOK, seriesName: "Thornmere Cycle", seriesVolume: 3 } }),
      { verdict: "wrong_series", name: "the thornmere cycle", volume: 3, why: "Spelt differently." },
    ],
    [
      "wrong series",
      { verdict: "wrong_series", name: "Saltglass Archive", volume: 2, why: "The publisher lists it there." },
      auditClaim(),
      { verdict: "wrong_series", name: "Saltglass Archive", volume: 2, why: "The publisher lists it there." },
    ],
    [
      "standalone",
      { verdict: "wrong_series", name: null, volume: 3, why: "A standalone." },
      auditClaim(),
      { verdict: "wrong_series", name: null, volume: null, why: "A standalone." },
    ],
    [
      "wrong number",
      { verdict: "wrong_number", name: "Ember Loom", volume: 4, why: "The title numbers it." },
      auditClaim(),
      { verdict: "wrong_number", name: null, volume: 4, why: "The title numbers it." },
    ],
    [
      "missing number named",
      { verdict: "wrong_number", name: null, volume: 4, why: "The title numbers it." },
      auditClaim({ book: { ...AUDIT_BOOK, seriesVolume: null } }),
      { verdict: "wrong_number", name: null, volume: 4, why: "The title numbers it." },
    ],
    [
      "missing number not named",
      { verdict: "wrong_number", name: null, volume: null, why: "" },
      auditClaim({ book: { ...AUDIT_BOOK, seriesVolume: null } }),
      { verdict: "agree", name: null, volume: null, why: null },
    ],
    [
      "unsure after search",
      { verdict: "unsure", name: "Ember Loom", volume: 9, why: "Still cannot tell." },
      auditClaim(),
      { verdict: "unsure", name: null, volume: null, why: "Still cannot tell." },
    ],
  ];
  for (const [label, answer, claim, want] of cases) {
    const searched = answer.verdict === "unsure";
    const { body, calls, auditInputs } = await runAudit(auditOk(answer, { searched }), { auditClaim: claim });
    assert.deepEqual(body, { outcome: "done" }, label);
    assert.deepEqual(auditInputs[0].recorded, { name: claim.book!.seriesName, volume: claim.book!.seriesVolume }, label);
    const result = calls.finish[0][2] as FinishResult;
    assert.deepEqual(result, { ...AUDIT_BASE, audit: want }, label);
    assert.equal(calls.finish[0][4], costMicro(MODEL, USAGE), label);
  }
});

Deno.test("audit: claimAudit outcomes other than claimed are returned as is, with no tagger call and no write", async () => {
  for (const outcome of ["done", "budget", "busy", "retry_later", "failed", "not_audit"]) {
    const { body, calls, auditInputs, urls } = await runAudit(never("auditSeries"), {
      auditClaim: auditClaim({ outcome, claimToken: null, book: null }),
    });
    assert.deepEqual(body, { outcome }, outcome);
    assert.equal(calls.claimAudit.length, 1, outcome);
    assert.equal(auditInputs.length, 0, outcome);
    assert.equal(urls.length, 0, outcome);
    assert.equal(calls.finish.length + calls.release.length, 0, outcome);
  }
});

Deno.test("audit: a full, new_tags or series claim never calls claimAudit or auditSeries", async () => {
  const full = await run(claimed(), { kind: "ok", result: RESULT, usage: USAGE }, { audit: never("auditSeries") });
  assert.deepEqual(full.body, { outcome: "done" });
  assert.equal(full.calls.claimAudit.length, 0);
  const series = await run(seriesClaim(), never("tag"), {
    audit: never("auditSeries"),
    series: { kind: "ok", status: "none", series: null, usage: USAGE, searched: false },
  });
  assert.deepEqual(series.body, { outcome: "done" });
  assert.equal(series.calls.claimAudit.length, 0);
  assert.equal(series.auditInputs.length, 0);
});

Deno.test("audit failures release as series checks do; billed unknown keeps SERIES_RESERVE_MICRO", async () => {
  const unknown = await runAudit({ kind: "retry", retryAfterSeconds: null, billedUnknown: true });
  assert.deepEqual(unknown.body, { outcome: "retry_later" });
  assert.equal(unknown.calls.finish.length, 0);
  assert.equal(unknown.calls.release[0][1], TOKEN);
  assert.equal(unknown.calls.release[0][2], null);
  assert.equal(unknown.calls.release[0][5], SERIES_RESERVE_MICRO);
  for (const code of ["tag_refused", "tag_unreadable"] as const) {
    const { body, calls } = await runAudit({ kind: "fail", code, usage: USAGE });
    assert.deepEqual(body, { outcome: "failed" });
    assert.equal(calls.finish.length, 0);
    assert.equal(calls.release[0][2], code);
    assert.equal(calls.release[0][5], costMicro(MODEL, USAGE));
  }
  for (const kind of ["billing", "misconfigured"] as const) {
    const { body, calls } = await runAudit({ kind });
    assert.deepEqual(body, { outcome: kind });
    assert.deepEqual(calls.release[0].slice(2), [kind, null, null, 0]);
  }
  // A billed-unknown search finishes unsure at no less than the reserve.
  const searchLost = await runAudit({ kind: "ok", verdict: "unsure", result: null, usage: USAGE, searched: true, searchFailure: "billed_unknown" });
  assert.deepEqual(searchLost.body, { outcome: "done" });
  assert.deepEqual((searchLost.calls.finish[0][2] as FinishResult).audit, { verdict: "unsure", name: null, volume: null, why: null });
  assert.equal(searchLost.calls.finish[0][4], Math.max(costMicro(MODEL, USAGE), SERIES_RESERVE_MICRO));
  // A throw after the audit claim releases the audit claim at its reserve.
  const thrown = await runAudit(never("auditSeries"));
  assert.equal(thrown.res.status, 500);
  assert.equal(thrown.calls.release[0][1], TOKEN);
  assert.equal(thrown.calls.release[0][5], SERIES_RESERVE_MICRO);
});

Deno.test("audit: Open Library failing still finishes, with no Open Library line; working, its line is sent", async () => {
  const claim = () => auditClaim({ book: { ...AUDIT_BOOK, isbns: [ISBN_A] } });
  const call = auditOk({ verdict: "agree", name: null, volume: null, why: "Fine." });
  const down = await runAudit(call, { auditClaim: claim(), fetch: olFetch(() => Promise.reject(new TypeError("network down"))) });
  assert.deepEqual(down.body, { outcome: "done" });
  assert.deepEqual(down.auditInputs[0].openLibrary, []);
  assert.equal(down.calls.finish.length, 1);
  const up = await runAudit(call, { auditClaim: claim(), fetch: olOk() });
  assert.deepEqual(up.auditInputs[0].openLibrary, OL_SERIES);
  assert.deepEqual(up.urls, [`https://openlibrary.org/isbn/${ISBN_A}.json`]);
});

Deno.test("audit logs hold codes only: no title, author, series or ISBN", async () => {
  const claim = () => auditClaim({ book: { ...AUDIT_BOOK, isbns: [ISBN_A] } });
  const { logged } = await logging(async () => {
    await runAudit({ kind: "ok", verdict: "unsure", result: null, usage: USAGE, searched: true, searchFailure: "billed_unknown" }, {
      auditClaim: claim(),
      fetch: olFetch(() => Promise.reject(new TypeError("Ember Loom down"))),
    });
    await runAudit({ kind: "fail", code: "tag_unreadable", usage: USAGE, unreadable: WHY_UNREADABLE }, { auditClaim: claim() });
    await runAudit(() => {
      throw Object.assign(new Error("Ember Loom #4 by Petra Wynnecombe leaked"), { code: "boom" });
    }, { auditClaim: claim() });
  });
  assert.ok(logged.length >= 3);
  const text = JSON.stringify(logged);
  for (const word of ["Ember", "Petra", "Wynnecombe", "Wrenfold", "Thornmere", "Saltglass", ISBN_A, "openlibrary"]) {
    assert.ok(!text.includes(word), word);
  }
});

Deno.test("rpcDb: claim outcome audit routes to claim_audit_job, mapped with kind audit; missing handSet reads false (the cluster)", async () => {
  const sent: { fn: string; args: Record<string, unknown> }[] = [];
  const cluster = [
    { title: "Ember Loom #1", seriesName: "Ember Loom", seriesVolume: 1 },
    { title: "Ember Loom #2", seriesName: "Ember Loom", seriesVolume: 2 },
    { title: "Ember Loom #3", seriesName: "Ember Loom", seriesVolume: 3, handSet: "yes" },
  ];
  const supabase: SupabaseLike = {
    schema: () => ({
      rpc(fn, args) {
        sent.push({ fn, args });
        if (fn === "claim_tag_job") {
          return Promise.resolve({
            data: [{ outcome: "audit", claim_token: null, attempts: null, kind: null, book: null, card: null, vocab: null, removed: null }],
            error: null,
          });
        }
        if (fn === "claim_audit_job") {
          return Promise.resolve({
            data: [{
              outcome: "claimed",
              claim_token: TOKEN,
              attempts: 1,
              book: { ...AUDIT_BOOK, isbns: [] },
              card: CARD,
              series_names: AUDIT_NAMES,
              same_author: cluster,
            }],
            error: null,
          });
        }
        return Promise.resolve({ data: "done", error: null });
      },
    }),
  };
  const db = rpcDb(supabase);
  const claim = await db.claimAudit(JOB);
  assert.deepEqual(claim, {
    outcome: "claimed",
    claimToken: TOKEN,
    attempts: 1,
    kind: "audit",
    book: AUDIT_BOOK,
    card: CARD,
    vocab: [],
    removed: { tos: [], library: [] },
    seriesNames: AUDIT_NAMES,
    sameAuthor: cluster.map((b) => ({ title: b.title, seriesName: b.seriesName, seriesVolume: b.seriesVolume, handSet: false })),
    hasSameAuthorColumn: true,
  });
  assert.deepEqual(sent[0], { fn: "claim_audit_job", args: { p_job: JOB } });

  sent.length = 0;
  const { tagger, auditInputs } = fakeTag(never("tag"), never("findSeries"), auditOk({ verdict: "wrong_series", name: null, volume: null, why: "Standalone." }));
  const res = await handle(post({ jobId: JOB }), { db, tagger, fetchImpl: fakeFetch().fetchImpl, tosTagsUrl: tosUrl(), now: () => NOW });
  assert.deepEqual(await res.json(), { outcome: "done" });
  assert.deepEqual(sent.map((s) => s.fn), ["claim_tag_job", "claim_audit_job", "finish_tag_job"]);
  assert.ok(auditInputs[0].neighbours.every((n) => n.handSet === false));
  const text = (buildAuditContent(auditInputs[0]) as { text?: string }[]).map((b) => b.text ?? "").join("\n");
  assert.equal(text.split("(not checked by hand)").length - 1, 3);
  assert.ok(!text.includes("(set by hand)"));
  const finish = sent[2].args;
  assert.deepEqual(finish.p_result, { ...AUDIT_BASE, audit: { verdict: "wrong_series", name: null, volume: null, why: "Standalone." } });

  // handSet true is kept.
  const hand = rpcDb({
    schema: () => ({
      rpc: () =>
        Promise.resolve({
          data: [{ outcome: "claimed", claim_token: TOKEN, attempts: 1, book: AUDIT_BOOK, card: null, series_names: [], same_author: [{ ...cluster[0], handSet: true }] }],
          error: null,
        }),
    }),
  });
  assert.equal((await hand.claimAudit(JOB)).sameAuthor[0].handSet, true);

  // Defence in depth: a claimed claim_tag_job row of kind audit reads as audit, never full, so tag() is never called.
  const odd = rpcDb({
    schema: () => ({
      rpc: (fn) =>
        Promise.resolve({
          data: fn === "claim_tag_job"
            ? [{ outcome: "claimed", claim_token: TOKEN, attempts: 1, kind: "audit", book: AUDIT_BOOK, card: CARD, vocab: [], removed: null }]
            : "done",
          error: null,
        }),
    }),
  });
  const oddTag = fakeTag(never("tag"), never("findSeries"), auditOk({ verdict: "agree", name: null, volume: null, why: "Fine." }));
  const oddRes = await handle(post({ jobId: JOB }), { db: odd, tagger: oddTag.tagger, fetchImpl: fakeFetch().fetchImpl, tosTagsUrl: tosUrl(), now: () => NOW });
  assert.deepEqual(await oddRes.json(), { outcome: "done" });
  assert.equal(oddTag.inputs.length, 0);
  assert.equal(oddTag.auditInputs.length, 1);
});

Deno.test("a series claim whose same_author rows carry no handSet still works, and its content is unchanged", async () => {
  const rows = [
    { title: "Lantern Vale Cycle #1", seriesName: "Lantern Vale Cycle", seriesVolume: 1 },
    { title: "Saltglass", seriesName: null, seriesVolume: null },
  ];
  const supabase: SupabaseLike = {
    schema: () => ({
      rpc(fn) {
        if (fn === "claim_tag_job") {
          return Promise.resolve({
            data: [{
              outcome: "claimed",
              claim_token: TOKEN,
              attempts: 1,
              kind: "series",
              book: { title: "Lantern Vale Cycle #2", authors: ["M. Holt"], seriesName: null, seriesVolume: null, description: "d", coverUrl: null },
              card: CARD,
              vocab: [],
              removed: { tos: [], library: [] },
              series_names: SERIES_NAMES,
              same_author: rows,
            }],
            error: null,
          });
        }
        return Promise.resolve({ data: "done", error: null });
      },
    }),
  };
  const { tagger, seriesInputs } = fakeTag(never("tag"), { kind: "ok", status: "none", series: null, usage: USAGE, searched: false }, never("auditSeries"));
  const res = await handle(post({ jobId: JOB }), { db: rpcDb(supabase), tagger, fetchImpl: fakeFetch().fetchImpl, tosTagsUrl: tosUrl(), now: () => NOW });
  assert.deepEqual(await res.json(), { outcome: "done" });
  assert.equal(seriesInputs[0].allowSearch, true);
  assert.deepEqual(buildSeriesContent(seriesInputs[0]), buildSeriesContent({ ...seriesInputs[0], sameAuthor: rows }));
});
