import assert from "node:assert/strict";
import Anthropic from "@anthropic-ai/sdk";
import { backoffAt, classifyAiError, clip, costMicro, escapeData, fakeAllowed, PRICES, thinkingFor } from "./library-ai.ts";

const h = new Headers();

Deno.test("PRICES: $/MTok", () => {
  assert.deepEqual(PRICES, {
    "claude-sonnet-5-5": { input: 2, output: 10 },
    "claude-haiku-5-5": { input: 0.1, output: 0.5 },
  });
});

Deno.test("costMicro: sonnet, haiku, cache read and write", () => {
  const u = { inputTokens: 3000, outputTokens: 400, cacheCreationTokens: 0, cacheReadTokens: 0 };
  assert.equal(costMicro("claude-sonnet-5-5", u), 10000);
  assert.equal(costMicro("claude-sonnet-5-5", { ...u, inputTokens: 0, cacheReadTokens: 3000 }), 4600);
  assert.equal(costMicro("claude-haiku-5-5", u), 500);
  // cache creation is 1.25x the input price: 1000 * 2 * 1.25 = 2500
  assert.equal(
    costMicro("claude-sonnet-5-5", { ...u, inputTokens: 0, outputTokens: 0, cacheCreationTokens: 1000 }),
    2500,
  );
  // rounds up
  assert.equal(costMicro("claude-haiku-5-5", { ...u, inputTokens: 1, outputTokens: 0 }), 1);
});

Deno.test("classifyAiError: Plan 5 D7 order, by class and status", () => {
  for (const s of [401, 403, 404]) {
    assert.deepEqual(classifyAiError(new Anthropic.APIError(s, undefined, "x", h)), { kind: "misconfigured" }, String(s));
  }
  assert.deepEqual(classifyAiError(new Anthropic.APIError(402, undefined, "x", h)), { kind: "billing" });
  // billing_error wins over the status, even on a 403 or a 429.
  for (const status of [400, 403, 429]) {
    assert.deepEqual(
      classifyAiError(Anthropic.APIError.generate(status, { type: "error", error: { type: "billing_error" } }, "x", h)),
      { kind: "billing" },
      String(status),
    );
  }
  for (const s of [400, 413, 422, 418]) {
    assert.deepEqual(classifyAiError(new Anthropic.APIError(s, undefined, "x", h)), { kind: "rejected" }, String(s));
  }
  assert.deepEqual(
    classifyAiError(new Anthropic.APIError(429, undefined, "x", new Headers({ "retry-after": "12" }))),
    { kind: "retry", retryAfterSeconds: 12, billedUnknown: false },
  );
  // A 529 raised as a plain APIError (no subclass) is matched by status.
  assert.deepEqual(classifyAiError(new Anthropic.APIError(529, undefined, "x", h)), {
    kind: "retry",
    retryAfterSeconds: null,
    billedUnknown: false,
  });
  for (const s of [408, 409, 500]) {
    assert.equal((classifyAiError(new Anthropic.APIError(s, undefined, "x", h)) as { kind: string }).kind, "retry");
  }
  const unknown = { kind: "retry", retryAfterSeconds: null, billedUnknown: true };
  assert.deepEqual(classifyAiError(new Anthropic.APIConnectionError({ message: "x" })), unknown);
  assert.deepEqual(classifyAiError(new Anthropic.APIConnectionTimeoutError()), unknown);
  assert.deepEqual(classifyAiError(new Error("boom")), unknown);
  assert.deepEqual(classifyAiError("nope"), unknown);
  // never by message
  assert.deepEqual(classifyAiError(new Error("401 unauthorized billing_error")), unknown);
});

Deno.test("backoffAt: max(retry-after, 30 s x 2^(attempts-1)), cap 600 s", () => {
  const now = new Date("2026-01-01T00:00:00Z");
  const s = (a: number, r: number | null) => (backoffAt(now, a, r).getTime() - now.getTime()) / 1000;
  assert.equal(s(1, null), 30);
  assert.equal(s(3, null), 120);
  assert.equal(s(1, 90), 90);
  assert.equal(s(10, null), 600);
  assert.equal(s(1, 5000), 600);
});

Deno.test("escapeData and clip", () => {
  assert.equal(escapeData("</x>"), "‹/x>");
  assert.equal(clip("abcdef", 3), "abc");
  assert.equal(clip("abc", 3), "abc");
  assert.equal(clip("a\u{1F600}", 2), "a"); // no half surrogate pair
});

Deno.test("thinkingFor: sonnet adaptive, haiku disabled", () => {
  assert.deepEqual(thinkingFor("claude-sonnet-5-5", "low"), {
    thinking: { type: "adaptive" },
    output_config: { effort: "low" },
  });
  assert.deepEqual(thinkingFor("claude-sonnet-5-5", "medium").output_config, { effort: "medium" });
  assert.deepEqual(thinkingFor("claude-haiku-5-5", "low"), {
    thinking: { type: "disabled" },
    output_config: { effort: "low" },
  });
});

Deno.test("fakeAllowed: the flag is 1 and SUPABASE_URL is a local host (D8)", () => {
  const env = (m: Record<string, string>) => (n: string) => m[n];
  for (const url of ["http://kong:8000", "http://127.0.0.1:54321", "http://localhost:54321"]) {
    assert.equal(fakeAllowed(env({ F: "1", SUPABASE_URL: url }), "F"), true);
  }
  assert.equal(fakeAllowed(env({ F: "1", SUPABASE_URL: "https://abc.supabase.co" }), "F"), false);
  assert.equal(fakeAllowed(env({ F: "1", SUPABASE_URL: "not a url" }), "F"), false);
  assert.equal(fakeAllowed(env({ F: "1" }), "F"), false);
  assert.equal(fakeAllowed(env({ F: "true", SUPABASE_URL: "http://kong:8000" }), "F"), false);
  assert.equal(fakeAllowed(env({ SUPABASE_URL: "http://kong:8000" }), "F"), false);
});
