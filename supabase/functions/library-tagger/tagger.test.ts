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
  TAG_RESERVE_MICRO,
} from "./tagger.ts";

const INPUT: TagInput = {
  kind: "full",
  title: "The Salt Road",
  authors: ["Member A. Writer"],
  seriesName: null,
  seriesVolume: null,
  description: "A courier crosses a dry sea.",
  card: null,
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
    const want = Math.ceil(w.plain * p.input + w.vocab * 1.25 * p.input + MAX_TOKENS * p.output);
    assert.equal(ceilingMicro(model), want, model);
    // the same number costMicro gives for that usage
    assert.equal(
      ceilingMicro(model),
      costMicro(model, { inputTokens: w.plain, cacheCreationTokens: w.vocab, cacheReadTokens: 0, outputTokens: MAX_TOKENS }),
    );
  }
  assert.equal(ceilingMicro(), ceilingMicro(MODEL));
});

Deno.test("TAG_RESERVE_MICRO is ceilingMicro(MODEL) rounded up to 1,000", () => {
  assert.ok(ceilingMicro() <= TAG_RESERVE_MICRO);
  assert.equal(TAG_RESERVE_MICRO, Math.ceil(ceilingMicro(MODEL) / 1000) * 1000);
  assert.equal(TAG_RESERVE_MICRO, 71_000);
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
