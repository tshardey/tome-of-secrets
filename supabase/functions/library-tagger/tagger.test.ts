import assert from "node:assert/strict";
import { costMicro, PRICES, thinkingFor } from "../_shared/library-ai.ts";
import { buildTagContent, TAG_SYSTEM_PROMPT, type TagInput, type TagResult, worstCaseTagTokens } from "./prompt.ts";
import {
  anthropicTagger,
  ceilingMicro,
  chooseTagger,
  fakeTagger,
  MAX_TOKENS,
  MODEL,
  SEARCH_FORMAT,
  SEARCH_TEXT_JSON_LINE,
  SEARCH_TOOL,
  SERIES_MAX_TOKENS,
  SERIES_RESERVE_MICRO,
  SERIES_SEARCH_MAX_TOKENS,
  SERIES_SEARCH_MODE,
  seriesCeilingMicro,
  TAG_RESERVE_MICRO,
  usageOf,
} from "./tagger.ts";
import {
  buildSeriesContent,
  SERIES_SEARCH_PROMPT,
  SERIES_SYSTEM_PROMPT,
  type SeriesInput,
  worstCaseSeriesTokens,
} from "./series.ts";

const INPUT: TagInput = {
  kind: "full",
  title: "The Salt Road",
  authors: ["Member A. Writer"],
  seriesName: null,
  seriesVolume: null,
  description: "A courier crosses a dry sea.",
  card: null,
  seriesNames: [],
  sameAuthor: [],
  openLibrary: [],
  tosTags: ["fantasy", "mystery"],
  vocab: [{ id: "found-family", category: "trope" }, { id: "cover-blue", category: "cover-colour" }],
  image: { mediaType: "image/png", bytes: new Uint8Array([0x89, 0x50, 0x4e, 0x47]) },
};

const RESULT: TagResult = {
  tos_tags: ["fantasy"],
  library_tags: ["found-family", "cover-blue"],
  summary: "A courier crosses a dry sea.",
  cover_description: "A blue field.",
  suggestions: [],
  series: null,
  series_status: "none",
};

function message(over: Record<string, unknown> = {}) {
  return {
    id: "msg_test",
    type: "message",
    role: "assistant",
    model: MODEL,
    content: [{ type: "text", text: JSON.stringify(RESULT) }],
    stop_reason: "end_turn",
    stop_sequence: null,
    usage: {
      input_tokens: 900,
      output_tokens: 300,
      cache_creation_input_tokens: 1200,
      cache_read_input_tokens: 0,
    },
    ...over,
  };
}

function stub(status: number, body: unknown, headers: Record<string, string> = {}) {
  const calls: { url: string; body: Record<string, unknown> }[] = [];
  const fetchImpl = ((input: RequestInfo | URL, init?: RequestInit) => {
    calls.push({ url: String(input), body: JSON.parse(String(init?.body ?? "{}")) });
    return Promise.resolve(
      new Response(JSON.stringify(body), {
        status,
        headers: { "content-type": "application/json", "request-id": "req_test", ...headers },
      }),
    );
  }) as typeof fetch;
  return { fetchImpl, calls };
}

const apiError = (type: string) => ({ type: "error", error: { type, message: "stubbed" } });

Deno.test("request: model, max_tokens, D1 thinking and effort, schema, exact prompt, D9 content", async () => {
  const { fetchImpl, calls } = stub(200, message());
  await anthropicTagger("test-key", { fetchImpl }).tag(INPUT);
  assert.equal(calls.length, 1);
  assert.ok(calls[0].url.endsWith("/v1/messages"));
  const body = calls[0].body;
  assert.equal(body.model, MODEL);
  assert.equal(body.max_tokens, 2048);
  assert.equal(MAX_TOKENS, 2048);
  assert.equal(body.system, TAG_SYSTEM_PROMPT);
  const t = thinkingFor(MODEL, "low");
  assert.deepEqual(body.thinking, t.thinking);
  const oc = body.output_config as { effort: string; format: { type: string; schema: Record<string, unknown> } };
  assert.equal(oc.effort, "low");
  assert.equal(oc.format.type, "json_schema");
  const props = oc.format.schema.properties as Record<string, unknown>;
  for (const k of ["tos_tags", "library_tags", "summary", "cover_description", "suggestions"]) assert.ok(k in props, k);
  assert.deepEqual(body.messages, [{ role: "user", content: JSON.parse(JSON.stringify(buildTagContent(INPUT))) }]);
  assert.ok(!("temperature" in body) && !("tools" in body));
});

Deno.test("request: the model option switches model and thinking (Haiku: disabled)", async () => {
  const { fetchImpl, calls } = stub(200, message());
  await anthropicTagger("k", { model: "claude-haiku-5-5", fetchImpl }).tag(INPUT);
  assert.equal(calls[0].body.model, "claude-haiku-5-5");
  assert.deepEqual(calls[0].body.thinking, { type: "disabled" });
  const { fetchImpl: f2, calls: c2 } = stub(200, message());
  await anthropicTagger("k", { model: "claude-sonnet-5-5", fetchImpl: f2 }).tag(INPUT);
  assert.deepEqual(c2[0].body.thinking, { type: "adaptive" });
});

Deno.test("ok: the parsed result and all four usage counts", async () => {
  const { fetchImpl } = stub(200, message());
  const r = await anthropicTagger("k", { fetchImpl }).tag(INPUT);
  assert.deepEqual(r, {
    kind: "ok",
    result: RESULT,
    usage: { inputTokens: 900, outputTokens: 300, cacheCreationTokens: 1200, cacheReadTokens: 0 },
  });
});

Deno.test("ok: null cache counts read as 0, and a thinking block before the text is skipped", async () => {
  const { fetchImpl } = stub(
    200,
    message({
      content: [{ type: "thinking", thinking: "", signature: "sig" }, { type: "text", text: JSON.stringify(RESULT) }],
      usage: { input_tokens: 5, output_tokens: 6, cache_creation_input_tokens: null, cache_read_input_tokens: null },
    }),
  );
  const r = await anthropicTagger("k", { fetchImpl }).tag(INPUT);
  assert.equal(r.kind, "ok");
  if (r.kind === "ok") {
    assert.deepEqual(r.usage, { inputTokens: 5, outputTokens: 6, cacheCreationTokens: 0, cacheReadTokens: 0 });
  }
});

Deno.test("refusal -> tag_refused with usage", async () => {
  const { fetchImpl } = stub(200, message({ stop_reason: "refusal", content: [{ type: "text", text: "no" }] }));
  const r = await anthropicTagger("k", { fetchImpl }).tag(INPUT);
  assert.equal(r.kind, "fail");
  if (r.kind === "fail") {
    assert.equal(r.code, "tag_refused");
    assert.equal(r.usage.outputTokens, 300);
  }
});

Deno.test("max_tokens, invalid JSON and a schema miss -> tag_unreadable with usage", async () => {
  const bodies = [
    message({ stop_reason: "max_tokens" }),
    message({ content: [{ type: "text", text: "{not json" }] }),
    message({ content: [{ type: "text", text: JSON.stringify({ tos_tags: "fantasy" }) }] }),
    message({ content: [] }),
  ];
  for (const b of bodies) {
    const { fetchImpl } = stub(200, b);
    const r = await anthropicTagger("k", { fetchImpl }).tag(INPUT);
    assert.equal(r.kind, "fail");
    if (r.kind === "fail") {
      assert.equal(r.code, "tag_unreadable");
      assert.equal(r.usage.inputTokens, 900);
    }
  }
});

Deno.test("429 -> retry with retry-after, not billed, and exactly one fetch (maxRetries 0)", async () => {
  const { fetchImpl, calls } = stub(429, apiError("rate_limit_error"), { "retry-after": "7" });
  const r = await anthropicTagger("k", { fetchImpl }).tag(INPUT);
  assert.deepEqual(r, { kind: "retry", retryAfterSeconds: 7, billedUnknown: false });
  assert.equal(calls.length, 1);
});

Deno.test("500, 401, 402 and 400 classify per D10 with one fetch each", async () => {
  const cases: [number, string, unknown][] = [
    [500, "api_error", { kind: "retry", retryAfterSeconds: null, billedUnknown: false }],
    [401, "authentication_error", { kind: "misconfigured" }],
    [402, "billing_error", { kind: "billing" }],
    [400, "invalid_request_error", { kind: "rejected" }],
  ];
  for (const [status, type, want] of cases) {
    const { fetchImpl, calls } = stub(status, apiError(type));
    assert.deepEqual(await anthropicTagger("k", { fetchImpl }).tag(INPUT), want, String(status));
    assert.equal(calls.length, 1, String(status));
  }
});

Deno.test("a connection error -> retry, billed unknown, one fetch", async () => {
  let n = 0;
  const fetchImpl = (() => {
    n++;
    return Promise.reject(new TypeError("connection reset"));
  }) as typeof fetch;
  const r = await anthropicTagger("k", { fetchImpl }).tag(INPUT);
  assert.deepEqual(r, { kind: "retry", retryAfterSeconds: null, billedUnknown: true });
  assert.equal(n, 1);
});

Deno.test("no key -> misconfigured, no fetch", async () => {
  const { fetchImpl, calls } = stub(200, message());
  assert.deepEqual(await anthropicTagger(undefined, { fetchImpl }).tag(INPUT), { kind: "misconfigured" });
  assert.deepEqual(await anthropicTagger("", { fetchImpl }).tag(INPUT), { kind: "misconfigured" });
  assert.equal(calls.length, 0);
});

Deno.test("ceilingMicro: plain input at 1x, the vocabulary at the 1.25x cache-write rate, max_tokens out", () => {
  const w = worstCaseTagTokens();
  for (const model of ["claude-sonnet-5-5", "claude-haiku-5-5"] as const) {
    const p = PRICES[model];
    const want = Math.ceil(w.plain * p.input + (w.vocab + w.series) * 1.25 * p.input + MAX_TOKENS * p.output);
    assert.equal(ceilingMicro(model), want, model);
    // the same number costMicro gives for that usage
    assert.equal(
      ceilingMicro(model),
      costMicro(model, { inputTokens: w.plain, cacheCreationTokens: w.vocab + w.series, cacheReadTokens: 0, outputTokens: MAX_TOKENS }),
    );
  }
  assert.equal(ceilingMicro(), ceilingMicro(MODEL));
});

Deno.test("TAG_RESERVE_MICRO is ceilingMicro(MODEL) rounded up to 1,000", () => {
  assert.ok(ceilingMicro() <= TAG_RESERVE_MICRO);
  assert.equal(TAG_RESERVE_MICRO, Math.ceil(ceilingMicro(MODEL) / 1000) * 1000);
  assert.equal(TAG_RESERVE_MICRO, 94_000);
});

Deno.test("fakeTagger: fantasy, cover-blue only with an image, fixed summary, usage 0", async () => {
  const withImage = await fakeTagger().tag(INPUT);
  assert.equal(withImage.kind, "ok");
  if (withImage.kind === "ok") {
    assert.deepEqual(withImage.result.tos_tags, ["fantasy"]);
    assert.deepEqual(withImage.result.library_tags, ["cover-blue"]);
    assert.ok(withImage.result.summary.length > 0);
    assert.deepEqual(withImage.usage, { inputTokens: 0, outputTokens: 0, cacheCreationTokens: 0, cacheReadTokens: 0 });
  }
  const noImage = await fakeTagger().tag({ ...INPUT, image: null });
  if (noImage.kind === "ok") {
    assert.deepEqual(noImage.result.library_tags, []);
    assert.equal(noImage.result.cover_description, null);
  } else assert.fail("fake should succeed");
});

Deno.test("chooseTagger: fake only when asked for and local", () => {
  const env = (m: Record<string, string>) => (n: string) => m[n];
  assert.equal(chooseTagger(env({ LIBRARY_TAGGER_FAKE: "1", SUPABASE_URL: "http://kong:8000" })), "fake");
  assert.equal(chooseTagger(env({ LIBRARY_TAGGER_FAKE: "1", SUPABASE_URL: "http://127.0.0.1:54321" })), "fake");
  assert.equal(chooseTagger(env({ LIBRARY_TAGGER_FAKE: "1", SUPABASE_URL: "http://localhost:54321" })), "fake");
  assert.equal(chooseTagger(env({ LIBRARY_TAGGER_FAKE: "1", SUPABASE_URL: "https://abc.supabase.co" })), "anthropic");
  assert.equal(chooseTagger(env({ LIBRARY_TAGGER_FAKE: "1", SUPABASE_URL: "not a url" })), "anthropic");
  assert.equal(chooseTagger(env({ SUPABASE_URL: "http://kong:8000" })), "anthropic");
});

// ---------------------------------------------------------------------------
// Plan 10: findSeries, the series ceiling and the fake's series
// ---------------------------------------------------------------------------

const SERIES_INPUT: SeriesInput & { allowSearch: boolean } = {
  title: "Lantern Vale #3",
  authors: ["Ines Dravenholt"],
  description: "The third book of Lantern Vale.",
  card: { summary: "A keeper lights the last lamp.", coverDescription: "A lamp on a hill." },
  seriesNames: ["Lantern Vale", "Thornmere Cycle"],
  sameAuthor: [],
  openLibrary: [],
  allowSearch: false,
};
const SERIES_OUT = { series: { name: "Lantern Vale", volume: 3, why: "The title numbers it." }, series_status: "found" };

Deno.test("findSeries: model, SERIES_MAX_TOKENS, thinking, schema, exact prompt, household block cached", async () => {
  const { fetchImpl, calls } = stub(200, message({ content: [{ type: "text", text: JSON.stringify(SERIES_OUT) }] }));
  const r = await anthropicTagger("k", { fetchImpl }).findSeries(SERIES_INPUT);
  assert.equal(calls.length, 1);
  const body = calls[0].body;
  assert.equal(body.model, MODEL);
  assert.equal(SERIES_MAX_TOKENS, 1024);
  assert.equal(body.max_tokens, SERIES_MAX_TOKENS);
  assert.equal(body.system, SERIES_SYSTEM_PROMPT);
  const t = thinkingFor(MODEL, "low");
  assert.deepEqual(body.thinking, t.thinking);
  const oc = body.output_config as { effort: string; format: { type: string; schema: Record<string, unknown> } };
  assert.equal(oc.effort, "low");
  assert.equal(oc.format.type, "json_schema");
  assert.ok("series" in (oc.format.schema.properties as Record<string, unknown>));
  assert.deepEqual(body.messages, [{ role: "user", content: JSON.parse(JSON.stringify(buildSeriesContent(SERIES_INPUT))) }]);
  const content = (body.messages as { content: Record<string, unknown>[] }[])[0].content;
  assert.deepEqual(content[0].cache_control, { type: "ephemeral" });
  assert.ok(!content.some((b) => b.type === "image"));
  assert.deepEqual(r, {
    kind: "ok",
    status: "found",
    series: SERIES_OUT.series,
    usage: { inputTokens: 900, outputTokens: 300, cacheCreationTokens: 1200, cacheReadTokens: 0 },
    searched: false,
  });
});

Deno.test("findSeries: a null series is ok", async () => {
  const { fetchImpl } = stub(200, message({ content: [{ type: "text", text: JSON.stringify({ series: null, series_status: "unsure" }) }] }));
  const r = await anthropicTagger("k", { fetchImpl }).findSeries(SERIES_INPUT);
  assert.equal(r.kind, "ok");
  if (r.kind === "ok") assert.equal(r.series, null);
});

Deno.test("findSeries: refusal -> tag_refused; max_tokens and bad JSON -> tag_unreadable, with usage", async () => {
  const refused = stub(200, message({ stop_reason: "refusal", content: [{ type: "text", text: "no" }] }));
  const r1 = await anthropicTagger("k", { fetchImpl: refused.fetchImpl }).findSeries(SERIES_INPUT);
  assert.equal(r1.kind, "fail");
  if (r1.kind === "fail") {
    assert.equal(r1.code, "tag_refused");
    assert.equal(r1.usage.outputTokens, 300);
  }
  for (const b of [message({ stop_reason: "max_tokens" }), message({ content: [{ type: "text", text: "{nope" }] })]) {
    const { fetchImpl } = stub(200, b);
    const r = await anthropicTagger("k", { fetchImpl }).findSeries(SERIES_INPUT);
    assert.equal(r.kind, "fail");
    if (r.kind === "fail") {
      assert.equal(r.code, "tag_unreadable");
      assert.equal(r.usage.inputTokens, 900);
    }
  }
});

Deno.test("findSeries: 429 -> retry, one fetch; no key -> misconfigured", async () => {
  const { fetchImpl, calls } = stub(429, apiError("rate_limit_error"), { "retry-after": "7" });
  const r = await anthropicTagger("k", { fetchImpl }).findSeries(SERIES_INPUT);
  assert.deepEqual(r, { kind: "retry", retryAfterSeconds: 7, billedUnknown: false });
  assert.equal(calls.length, 1);
  const none = stub(200, message());
  assert.deepEqual(await anthropicTagger(undefined, { fetchImpl: none.fetchImpl }).findSeries(SERIES_INPUT), { kind: "misconfigured" });
  assert.equal(none.calls.length, 0);
});

Deno.test("seriesCeilingMicro: plain at 1x, the household block at 1.25x, SERIES_MAX_TOKENS out", () => {
  const w = worstCaseSeriesTokens();
  for (const model of ["claude-sonnet-5-5", "claude-haiku-5-5"] as const) {
    const p = PRICES[model];
    const want = Math.ceil(w.plain * p.input + w.block * 1.25 * p.input + SERIES_MAX_TOKENS * p.output);
    assert.equal(seriesCeilingMicro(model), want, model);
  }
  assert.equal(seriesCeilingMicro(), seriesCeilingMicro(MODEL));
});

Deno.test("SERIES_RESERVE_MICRO covers its ceiling and is the measured-and-kept 150,000 (D10)", () => {
  assert.ok(seriesCeilingMicro() <= SERIES_RESERVE_MICRO);
  // Pinned: library.series_reserve_micro() returns the same literal (Task 4).
  assert.equal(SERIES_RESERVE_MICRO, 150_000);
  assert.ok(ceilingMicro() <= TAG_RESERVE_MICRO);
});

Deno.test("fakeTagger: tag and findSeries read the series from the title, usage 0", async () => {
  const tagged = await fakeTagger().tag({ ...INPUT, title: "Lantern Vale #3" });
  assert.equal(tagged.kind, "ok");
  if (tagged.kind === "ok") assert.deepEqual(tagged.result.series, { name: "Lantern Vale", volume: 3, why: "Fake series from the title." });
  const plain = await fakeTagger().tag(INPUT);
  if (plain.kind === "ok") assert.equal(plain.result.series, null);
  const found = await fakeTagger().findSeries(SERIES_INPUT);
  assert.deepEqual(found, {
    kind: "ok",
    status: "found",
    series: { name: "Lantern Vale", volume: 3, why: "Fake series from the title." },
    usage: { inputTokens: 0, outputTokens: 0, cacheCreationTokens: 0, cacheReadTokens: 0 },
    searched: false,
  });
  // The fake never searches, even when allowed: found from the title, else none.
  const none = await fakeTagger().findSeries({ ...SERIES_INPUT, title: "Saltglass", allowSearch: true });
  assert.equal(none.kind, "ok");
  if (none.kind === "ok") {
    assert.equal(none.series, null);
    assert.equal(none.status, "none");
    assert.equal(none.searched, false);
  }
});

// ---------------------------------------------------------------------------
// Plan 11: series checks that search only when unsure (D8), search fees (D10)
// ---------------------------------------------------------------------------

/** Answers each request with the next body in turn (the last one repeats); records every request body. */
function seq(...bodies: unknown[]) {
  const calls: Record<string, unknown>[] = [];
  const fetchImpl = ((_input: RequestInfo | URL, init?: RequestInit) => {
    calls.push(JSON.parse(String(init?.body ?? "{}")));
    const body = bodies[Math.min(calls.length - 1, bodies.length - 1)];
    return Promise.resolve(
      new Response(JSON.stringify(body), { status: 200, headers: { "content-type": "application/json", "request-id": "req_test" } }),
    );
  }) as typeof fetch;
  return { fetchImpl, calls };
}

const answer = (out: unknown, over: Record<string, unknown> = {}) =>
  message({ content: [{ type: "text", text: JSON.stringify(out) }], ...over });
const UNSURE = { series: null, series_status: "unsure" };
const FOUND = SERIES_OUT;
const SEARCH_USAGE = {
  input_tokens: 4000,
  output_tokens: 700,
  cache_creation_input_tokens: 0,
  cache_read_input_tokens: 1200,
  server_tool_use: { web_search_requests: 2 },
};
const FIRST = { inputTokens: 900, outputTokens: 300, cacheCreationTokens: 1200, cacheReadTokens: 0 };
const SUMMED = { inputTokens: 4900, outputTokens: 1000, cacheCreationTokens: 1200, cacheReadTokens: 1200, webSearchRequests: 2 };

/** A search reply: a query, its result, then the answer text. */
function searched(out: unknown, over: Record<string, unknown> = {}) {
  return message({
    content: [
      { type: "text", text: "Checking." },
      { type: "server_tool_use", id: "srvtoolu_1", name: "web_search", input: { query: "Lantern Vale Ines Dravenholt" } },
      { type: "web_search_tool_result", tool_use_id: "srvtoolu_1", content: [] },
      { type: "text", text: typeof out === "string" ? out : JSON.stringify(out) },
    ],
    usage: SEARCH_USAGE,
    ...over,
  });
}

Deno.test("search constants: two_step, the tool, json_schema and 4,096 tokens, as Task 6 measured", () => {
  assert.equal(SERIES_SEARCH_MODE, "two_step");
  assert.deepEqual(SEARCH_TOOL, { type: "web_search_20260318", name: "web_search", max_uses: 2, response_inclusion: "excluded" });
  assert.equal(SEARCH_FORMAT, "json_schema");
  assert.equal(SERIES_SEARCH_MAX_TOKENS, 4096);
});

Deno.test("usageOf reads server_tool_use.web_search_requests; absent, the field is left out", () => {
  assert.deepEqual(usageOf(SEARCH_USAGE as never), {
    inputTokens: 4000,
    outputTokens: 700,
    cacheCreationTokens: 0,
    cacheReadTokens: 1200,
    webSearchRequests: 2,
  });
  assert.equal("webSearchRequests" in usageOf(message().usage as never), false);
});

Deno.test("two_step: found on the first call makes one request, with no tools", async () => {
  const { fetchImpl, calls } = seq(answer(FOUND));
  const r = await anthropicTagger("k", { fetchImpl }).findSeries({ ...SERIES_INPUT, allowSearch: true });
  assert.equal(calls.length, 1);
  assert.ok(!("tools" in calls[0]));
  assert.equal(calls[0].system, SERIES_SYSTEM_PROMPT);
  assert.deepEqual(r, { kind: "ok", status: "found", series: FOUND.series, usage: FIRST, searched: false });
});

Deno.test("two_step: none on the first call makes one request", async () => {
  const { fetchImpl, calls } = seq(answer({ series: null, series_status: "none" }));
  const r = await anthropicTagger("k", { fetchImpl }).findSeries({ ...SERIES_INPUT, allowSearch: true });
  assert.equal(calls.length, 1);
  assert.equal(r.kind === "ok" && r.status, "none");
});

Deno.test("two_step: unsure with allowSearch makes a second request with the tool; the usage is the sum", async () => {
  const { fetchImpl, calls } = seq(answer(UNSURE), searched(FOUND));
  const r = await anthropicTagger("k", { fetchImpl }).findSeries({ ...SERIES_INPUT, allowSearch: true });
  assert.equal(calls.length, 2);
  const second = calls[1];
  assert.deepEqual(second.tools, [SEARCH_TOOL]);
  assert.equal(second.system, SERIES_SEARCH_PROMPT);
  assert.equal(second.max_tokens, SERIES_SEARCH_MAX_TOKENS);
  assert.equal(second.model, MODEL);
  assert.deepEqual(second.thinking, thinkingFor(MODEL, "low").thinking);
  assert.ok(!("tool_choice" in second));
  const oc = second.output_config as { effort: string; format: { type: string } };
  assert.equal(oc.effort, "low");
  assert.equal(oc.format.type, "json_schema");
  assert.deepEqual(second.messages, calls[0].messages);
  assert.deepEqual(r, { kind: "ok", status: "found", series: FOUND.series, usage: SUMMED, searched: true });
  if (r.kind === "ok") assert.equal(costMicro(MODEL, r.usage), costMicro(MODEL, { ...SUMMED, webSearchRequests: 0 }) + 20_000);
});

Deno.test("two_step: unsure without allowSearch makes no second request", async () => {
  const { fetchImpl, calls } = seq(answer(UNSURE), searched(FOUND));
  const r = await anthropicTagger("k", { fetchImpl }).findSeries({ ...SERIES_INPUT, allowSearch: false });
  assert.equal(calls.length, 1);
  assert.deepEqual(r, { kind: "ok", status: "unsure", series: null, usage: FIRST, searched: false });
});

Deno.test("two_step: a first-call failure returns as before, with no search", async () => {
  const { fetchImpl, calls } = seq(message({ stop_reason: "refusal", content: [{ type: "text", text: "no" }] }));
  const r = await anthropicTagger("k", { fetchImpl }).findSeries({ ...SERIES_INPUT, allowSearch: true });
  assert.equal(calls.length, 1);
  assert.equal(r.kind === "fail" && r.code, "tag_refused");
});

Deno.test("single: one request with the tool when allowSearch; without it, the plain call", async () => {
  const on = seq(searched(FOUND));
  const r = await anthropicTagger("k", { fetchImpl: on.fetchImpl, searchMode: "single" }).findSeries({ ...SERIES_INPUT, allowSearch: true });
  assert.equal(on.calls.length, 1);
  assert.deepEqual(on.calls[0].tools, [SEARCH_TOOL]);
  assert.equal(on.calls[0].system, SERIES_SEARCH_PROMPT);
  assert.equal(on.calls[0].max_tokens, SERIES_SEARCH_MAX_TOKENS);
  assert.deepEqual(r, {
    kind: "ok",
    status: "found",
    series: FOUND.series,
    usage: { inputTokens: 4000, outputTokens: 700, cacheCreationTokens: 0, cacheReadTokens: 1200, webSearchRequests: 2 },
    searched: true,
  });

  const off = seq(answer(UNSURE));
  const r2 = await anthropicTagger("k", { fetchImpl: off.fetchImpl, searchMode: "single" }).findSeries({ ...SERIES_INPUT, allowSearch: false });
  assert.equal(off.calls.length, 1);
  assert.ok(!("tools" in off.calls[0]));
  assert.equal(off.calls[0].system, SERIES_SYSTEM_PROMPT);
  assert.equal(off.calls[0].max_tokens, SERIES_MAX_TOKENS);
  assert.deepEqual(r2, { kind: "ok", status: "unsure", series: null, usage: FIRST, searched: false });
});

Deno.test("Review Focus 2: pause_turn, max_tokens, a tool error or an unparseable reply -> unsure, usage kept, one search request", async () => {
  const toolError = message({
    content: [
      { type: "server_tool_use", id: "srvtoolu_1", name: "web_search", input: { query: "q" } },
      {
        type: "web_search_tool_result",
        tool_use_id: "srvtoolu_1",
        content: { type: "web_search_tool_result_error", error_code: "max_uses_exceeded" },
      },
      { type: "text", text: JSON.stringify(FOUND) },
    ],
    usage: SEARCH_USAGE,
  });
  const replies = [
    ["pause_turn", searched(FOUND, { stop_reason: "pause_turn" })],
    ["max_tokens", searched(FOUND, { stop_reason: "max_tokens" })],
    ["tool error", toolError],
    ["unparseable", searched("{not json")],
    ["schema miss", searched({ series: "Lantern Vale", series_status: "found" })],
    ["no text", message({ content: [], usage: SEARCH_USAGE })],
  ] as const;
  for (const mode of ["two_step", "single"] as const) {
    for (const [name, reply] of replies) {
      const bodies = mode === "two_step" ? [answer(UNSURE), reply] : [reply];
      const { fetchImpl, calls } = seq(...bodies);
      const r = await anthropicTagger("k", { fetchImpl, searchMode: mode }).findSeries({ ...SERIES_INPUT, allowSearch: true });
      const label = `${mode} ${name}`;
      assert.equal(calls.length, bodies.length, label); // never resumed, never retried
      assert.equal(calls.filter((c) => "tools" in c).length, 1, label);
      assert.equal(r.kind, "ok", label);
      if (r.kind === "ok") {
        assert.equal(r.status, "unsure", label);
        assert.equal(r.series, null, label);
        assert.equal(r.searched, true, label);
        assert.deepEqual(r.usage, mode === "two_step" ? SUMMED : usageOf(SEARCH_USAGE as never), label);
      }
    }
  }
});

Deno.test("a refused search call -> tag_refused with the summed usage", async () => {
  const { fetchImpl, calls } = seq(answer(UNSURE), searched("no", { stop_reason: "refusal" }));
  const r = await anthropicTagger("k", { fetchImpl }).findSeries({ ...SERIES_INPUT, allowSearch: true });
  assert.equal(calls.length, 2);
  assert.deepEqual(r, { kind: "fail", code: "tag_refused", usage: SUMMED });
});

Deno.test("a failed second call is never retried: unsure with the first call's usage and the failure named", async () => {
  const cases: [number, string, string][] = [
    [429, "rate_limit_error", "retry"],
    [500, "api_error", "retry"],
    [400, "invalid_request_error", "rejected"],
    [402, "billing_error", "billing"],
    [401, "authentication_error", "misconfigured"],
  ];
  for (const [status, type, failure] of cases) {
    const calls: unknown[] = [];
    const fetchImpl = ((_i: RequestInfo | URL, init?: RequestInit) => {
      calls.push(init?.body);
      const first = calls.length === 1;
      return Promise.resolve(
        new Response(JSON.stringify(first ? answer(UNSURE) : apiError(type)), {
          status: first ? 200 : status,
          headers: { "content-type": "application/json", "request-id": "req_test" },
        }),
      );
    }) as typeof fetch;
    const r = await anthropicTagger("k", { fetchImpl }).findSeries({ ...SERIES_INPUT, allowSearch: true });
    assert.equal(calls.length, 2, String(status));
    assert.deepEqual(
      r,
      { kind: "ok", status: "unsure", series: null, usage: FIRST, searched: true, searchFailure: failure },
      String(status),
    );
  }
  // A connection error on the search call may have been billed: named billed_unknown.
  let n = 0;
  const flaky = ((_i: RequestInfo | URL) => {
    n++;
    if (n === 1) {
      return Promise.resolve(new Response(JSON.stringify(answer(UNSURE)), { status: 200, headers: { "content-type": "application/json" } }));
    }
    return Promise.reject(new TypeError("connection reset"));
  }) as typeof fetch;
  const r = await anthropicTagger("k", { fetchImpl: flaky }).findSeries({ ...SERIES_INPUT, allowSearch: true });
  assert.equal(n, 2);
  assert.deepEqual(r, { kind: "ok", status: "unsure", series: null, usage: FIRST, searched: true, searchFailure: "billed_unknown" });
});

Deno.test("single: a billed-unknown search call is unsure, not a retry; an unbilled failure returns as before", async () => {
  const flaky = (() => Promise.reject(new TypeError("connection reset"))) as typeof fetch;
  const r = await anthropicTagger("k", { fetchImpl: flaky, searchMode: "single" }).findSeries({ ...SERIES_INPUT, allowSearch: true });
  assert.deepEqual(r, {
    kind: "ok",
    status: "unsure",
    series: null,
    usage: { inputTokens: 0, outputTokens: 0, cacheCreationTokens: 0, cacheReadTokens: 0 },
    searched: true,
    searchFailure: "billed_unknown",
  });
  const { fetchImpl } = stub(429, apiError("rate_limit_error"), { "retry-after": "7" });
  const r2 = await anthropicTagger("k", { fetchImpl, searchMode: "single" }).findSeries({ ...SERIES_INPUT, allowSearch: true });
  assert.deepEqual(r2, { kind: "retry", retryAfterSeconds: 7, billedUnknown: false });
});

Deno.test("text_json: no output_config.format, the prompt asks for JSON, text after the last tool result is parsed", async () => {
  const reply = message({
    content: [
      { type: "text", text: 'I will look this up. {"ignored": true}' },
      { type: "server_tool_use", id: "srvtoolu_1", name: "web_search", input: { query: "q" } },
      { type: "web_search_tool_result", tool_use_id: "srvtoolu_1", content: [] },
      { type: "text", text: '{"series": {"name": "Lantern Vale", "volume": 3, ' },
      { type: "text", text: '"why": "The title numbers it."}, "series_status": "found"}' },
    ],
    usage: SEARCH_USAGE,
  });
  const { fetchImpl, calls } = seq(answer(UNSURE), reply);
  const r = await anthropicTagger("k", { fetchImpl, searchFormat: "text_json" }).findSeries({ ...SERIES_INPUT, allowSearch: true });
  assert.equal(calls.length, 2);
  // The first, tool-less call keeps json_schema.
  assert.equal((calls[0].output_config as { format?: { type: string } }).format?.type, "json_schema");
  const oc = calls[1].output_config as Record<string, unknown>;
  assert.ok(!("format" in oc));
  assert.equal(oc.effort, "low");
  assert.equal(calls[1].system, `${SERIES_SEARCH_PROMPT}\n${SEARCH_TEXT_JSON_LINE}`);
  assert.ok(SEARCH_TEXT_JSON_LINE.startsWith("Answer with only a JSON object"));
  assert.deepEqual(r, { kind: "ok", status: "found", series: FOUND.series, usage: SUMMED, searched: true });
});
