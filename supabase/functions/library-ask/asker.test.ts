import assert from "node:assert/strict";
import { classifyAiError, PRICES, thinkingFor } from "../_shared/library-ai.ts";
import { ASK_SYSTEM_PROMPT, type AskBook, type AskResult, buildAskList, READ_DESCRIPTIONS_TOOL } from "./prompt.ts";
import { anthropicAsker, askReserveMicro, fakeAsker, MAX_TOKENS, MODEL } from "./asker.ts";

const book = (ref: number): AskBook => ({
  ref,
  bookId: `00000000-0000-4000-8000-${String(ref).padStart(12, "0")}`,
  title: `Glass Orchard ${ref}`,
  authors: ["Member A"],
  seriesName: null,
  seriesVolume: null,
  pageCount: 300,
  publishYear: "2010",
  tags: ["fantasy"],
  summary: "A short summary.",
  coverDescription: null,
  trimmedDescription: null,
});
const BOOKS = Array.from({ length: 10 }, (_, i) => book(i + 1));

const RESULT: AskResult = {
  answerable: true,
  note: null,
  matches: [{ book: 2, confidence: 80, reason: "Fits." }],
};

const usage = (i: number, o: number, cw = 0, cr = 0) => ({
  input_tokens: i,
  output_tokens: o,
  cache_creation_input_tokens: cw,
  cache_read_input_tokens: cr,
});

function message(over: Record<string, unknown> = {}) {
  return {
    id: "msg_test",
    type: "message",
    role: "assistant",
    model: MODEL,
    content: [{ type: "text", text: JSON.stringify(RESULT) }],
    stop_reason: "end_turn",
    stop_sequence: null,
    usage: usage(100, 50, 2000, 0),
    ...over,
  };
}

const toolUse = (books: unknown, id = "toolu_1") =>
  message({
    content: [
      { type: "thinking", thinking: "", signature: "sig" },
      { type: "tool_use", id, name: "read_descriptions", input: { books } },
    ],
    stop_reason: "tool_use",
    usage: usage(100, 40, 2000, 0),
  });

/** Answers each request with the next body in turn (status 200 unless given). */
function seq(...replies: { status?: number; body: unknown; headers?: Record<string, string> }[]) {
  const calls: { url: string; body: Record<string, unknown> }[] = [];
  const fetchImpl = ((input: RequestInfo | URL, init?: RequestInit) => {
    calls.push({ url: String(input), body: JSON.parse(String(init?.body ?? "{}")) });
    const r = replies[Math.min(calls.length - 1, replies.length - 1)];
    return Promise.resolve(
      new Response(JSON.stringify(r.body), {
        status: r.status ?? 200,
        headers: { "content-type": "application/json", "request-id": "req_test", ...(r.headers ?? {}) },
      }),
    );
  }) as typeof fetch;
  return { fetchImpl, calls };
}

const apiError = (type: string) => ({ type: "error", error: { type, message: "stubbed" } });
const noRead = () => Promise.reject(new Error("must not read"));
type Block = Record<string, unknown> & { type: string };

Deno.test("round 1: system, cached list, escaped prompt last, strict tool, D1 settings, schema", async () => {
  const { fetchImpl, calls } = seq({ body: message() });
  await anthropicAsker("k", { fetchImpl }).ask(BOOKS, "A <b>tale</b>", noRead);
  assert.equal(calls.length, 1);
  const b = calls[0].body;
  assert.equal(b.model, MODEL);
  assert.equal(b.max_tokens, 6000);
  assert.equal(MAX_TOKENS, 6000);
  assert.equal(b.system, ASK_SYSTEM_PROMPT);
  assert.deepEqual(b.thinking, thinkingFor(MODEL, "medium").thinking);
  const oc = b.output_config as { effort: string; format: { type: string; schema: Record<string, unknown> } };
  assert.equal(oc.effort, "medium");
  assert.equal(oc.format.type, "json_schema");
  assert.ok("matches" in (oc.format.schema.properties as Record<string, unknown>));
  assert.deepEqual(b.tools, [JSON.parse(JSON.stringify(READ_DESCRIPTIONS_TOOL))]);
  assert.equal((b.tools as { strict: boolean }[])[0].strict, true);
  assert.ok(!("tool_choice" in b) || (b.tool_choice as { type: string }).type === "auto");
  const msgs = b.messages as { role: string; content: Block[] }[];
  assert.equal(msgs.length, 1);
  assert.deepEqual(msgs[0].content, [
    { type: "text", text: buildAskList(BOOKS), cache_control: { type: "ephemeral" } },
    { type: "text", text: "Prompt: <prompt>A ‹b>tale‹/b></prompt>" },
  ]);
});

Deno.test("round 1: the prompt is clipped to 300 characters", async () => {
  const { fetchImpl, calls } = seq({ body: message() });
  await anthropicAsker("k", { fetchImpl }).ask(BOOKS, "x".repeat(400), noRead);
  const msgs = calls[0].body.messages as { content: { text: string }[] }[];
  assert.equal(msgs[0].content[1].text, `Prompt: <prompt>${"x".repeat(300)}</prompt>`);
});

Deno.test("one round: ok with the result, usage and rounds 1, no read", async () => {
  const { fetchImpl, calls } = seq({ body: message() });
  const r = await anthropicAsker("k", { fetchImpl }).ask(BOOKS, "p", noRead);
  assert.deepEqual(r, {
    kind: "ok",
    result: RESULT,
    usage: { inputTokens: 100, outputTokens: 50, cacheCreationTokens: 2000, cacheReadTokens: 0 },
    rounds: 1,
  });
  assert.equal(calls.length, 1);
});

Deno.test("tool flow: at most 5 in-range refs read, round 2 with tool_choice none, usage summed", async () => {
  const reads: number[][] = [];
  const read = (refs: number[]) => {
    reads.push(refs);
    return Promise.resolve(new Map(refs.map((r) => [r, r === 9 ? "<b>" + "d".repeat(2100) : `Description ${r}.`])));
  };
  const { fetchImpl, calls } = seq(
    { body: toolUse([2, 9, 1, 3, 4, 5, 6]) },
    { body: message({ usage: usage(30, 60, 0, 2000) }) },
  );
  const r = await anthropicAsker("k", { fetchImpl }).ask(BOOKS, "p", read);
  assert.deepEqual(reads, [[2, 9, 1, 3, 4]]);
  assert.equal(calls.length, 2);
  const b2 = calls[1].body;
  assert.deepEqual(b2.tool_choice, { type: "none" });
  assert.deepEqual(b2.tools, calls[0].body.tools);
  assert.equal(b2.system, calls[0].body.system);
  const msgs = b2.messages as { role: string; content: Block[] }[];
  assert.equal(msgs.length, 3);
  assert.deepEqual(msgs[0], (calls[0].body.messages as unknown[])[0]);
  assert.equal(msgs[1].role, "assistant");
  assert.deepEqual(msgs[1].content, toolUse([2, 9, 1, 3, 4, 5, 6]).content);
  assert.equal(msgs[2].role, "user");
  assert.equal(msgs[2].content.length, 1);
  const tr = msgs[2].content[0] as { type: string; tool_use_id: string; content: string };
  assert.equal(tr.type, "tool_result");
  assert.equal(tr.tool_use_id, "toolu_1");
  assert.ok(tr.content.includes("[2] <description>Description 2.</description>"));
  assert.ok(tr.content.includes(`[9] <description>‹b>${"d".repeat(1997)}</description>`));
  assert.ok(!tr.content.includes("[5]") && !tr.content.includes("[6]"));
  assert.deepEqual(r, {
    kind: "ok",
    result: RESULT,
    usage: { inputTokens: 130, outputTokens: 100, cacheCreationTokens: 2000, cacheReadTokens: 2000 },
    rounds: 2,
  });
});

Deno.test("tool flow: refs out of range, repeated or not integers are dropped; a missing description says so", async () => {
  const reads: number[][] = [];
  const read = (refs: number[]) => {
    reads.push(refs);
    return Promise.resolve(new Map<number, string>());
  };
  const { fetchImpl, calls } = seq({ body: toolUse([0, 99, 2, 2, -1, 3]) }, { body: message() });
  await anthropicAsker("k", { fetchImpl }).ask(BOOKS, "p", read);
  assert.deepEqual(reads, [[2, 3]]);
  const tr = (calls[1].body.messages as { content: { content: string }[] }[])[2].content[0];
  assert.ok(tr.content.includes("[2] no description"));
});

Deno.test("tool flow: a second tool_use is never answered (two requests at most) -> ask_unreadable", async () => {
  const { fetchImpl, calls } = seq({ body: toolUse([1]) }, { body: toolUse([2], "toolu_2") }, { body: message() });
  const r = await anthropicAsker("k", { fetchImpl }).ask(BOOKS, "p", (refs) => Promise.resolve(new Map(refs.map((x) => [x, "d"]))));
  assert.equal(calls.length, 2);
  assert.equal(r.kind, "fail");
  if (r.kind === "fail") {
    assert.equal(r.code, "ask_unreadable");
    assert.equal(r.usage.inputTokens, 200);
  }
});

Deno.test("refusal -> ask_refused; max_tokens and bad JSON -> ask_unreadable; usage kept", async () => {
  const cases: [Record<string, unknown>, string][] = [
    [{ stop_reason: "refusal", content: [{ type: "text", text: "no" }] }, "ask_refused"],
    [{ stop_reason: "max_tokens" }, "ask_unreadable"],
    [{ content: [{ type: "text", text: "{nope" }] }, "ask_unreadable"],
    [{ content: [{ type: "text", text: JSON.stringify({ answerable: "yes" }) }] }, "ask_unreadable"],
  ];
  for (const [over, code] of cases) {
    const { fetchImpl } = seq({ body: message(over) });
    const r = await anthropicAsker("k", { fetchImpl }).ask(BOOKS, "p", noRead);
    assert.deepEqual(r, { kind: "fail", code, usage: { inputTokens: 100, outputTokens: 50, cacheCreationTokens: 2000, cacheReadTokens: 0 } });
  }
});

Deno.test("a refusal on round 2 -> ask_refused with both rounds' usage", async () => {
  const { fetchImpl } = seq({ body: toolUse([1]) }, { body: message({ stop_reason: "refusal", content: [] }) });
  const r = await anthropicAsker("k", { fetchImpl }).ask(BOOKS, "p", () => Promise.resolve(new Map()));
  assert.equal(r.kind, "fail");
  if (r.kind === "fail") {
    assert.equal(r.code, "ask_refused");
    assert.equal(r.usage.outputTokens, 90);
  }
});

Deno.test("429 on round 1 -> retry, not billed, exactly one fetch (maxRetries 0)", async () => {
  const { fetchImpl, calls } = seq({ status: 429, body: apiError("rate_limit_error"), headers: { "retry-after": "5" } });
  const r = await anthropicAsker("k", { fetchImpl }).ask(BOOKS, "p", noRead);
  assert.deepEqual(r, { kind: "retry", retryAfterSeconds: 5, billedUnknown: false });
  assert.equal(calls.length, 1);
});

Deno.test("an error on round 2 is billed unknown (round 1 was billed); billing stays billing", async () => {
  const { fetchImpl, calls } = seq({ body: toolUse([1]) }, { status: 429, body: apiError("rate_limit_error") });
  const r = await anthropicAsker("k", { fetchImpl }).ask(BOOKS, "p", () => Promise.resolve(new Map()));
  assert.deepEqual(r, { kind: "retry", retryAfterSeconds: null, billedUnknown: true });
  assert.equal(calls.length, 2);
  const b = seq({ body: toolUse([1]) }, { status: 402, body: apiError("billing_error") });
  assert.deepEqual(
    await anthropicAsker("k", { fetchImpl: b.fetchImpl }).ask(BOOKS, "p", () => Promise.resolve(new Map())),
    { kind: "billing" },
  );
});

Deno.test("count: one count_tokens request with the same system, tools and messages", async () => {
  const { fetchImpl, calls } = seq({ body: { input_tokens: 4321 } });
  const n = await anthropicAsker("k", { fetchImpl }).count(BOOKS, "p");
  assert.equal(n, 4321);
  assert.equal(calls.length, 1);
  assert.ok(calls[0].url.includes("/v1/messages/count_tokens"));
  const b = calls[0].body;
  assert.equal(b.model, MODEL);
  assert.equal(b.system, ASK_SYSTEM_PROMPT);
  assert.equal((b.tools as unknown[]).length, 1);
  assert.equal((b.messages as unknown[]).length, 1);
});

Deno.test("count: a 401 rejects with an error classifyAiError calls misconfigured, one fetch", async () => {
  const { fetchImpl, calls } = seq({ status: 401, body: apiError("authentication_error") });
  const err = await anthropicAsker("k", { fetchImpl }).count(BOOKS, "p").then(() => null, (e) => e);
  assert.deepEqual(classifyAiError(err), { kind: "misconfigured" });
  assert.equal(calls.length, 1);
});

Deno.test("no key: ask -> misconfigured and count rejects as misconfigured, no fetch", async () => {
  const { fetchImpl, calls } = seq({ body: message() });
  const a = anthropicAsker(undefined, { fetchImpl });
  assert.deepEqual(await a.ask(BOOKS, "p", noRead), { kind: "misconfigured" });
  const err = await a.count(BOOKS, "p").then(() => null, (e) => e);
  assert.deepEqual(classifyAiError(err), { kind: "misconfigured" });
  assert.equal(calls.length, 0);
});

Deno.test("askReserveMicro: two full-price requests, five descriptions, two full outputs (D6)", () => {
  for (const model of ["claude-sonnet-5-5", "claude-haiku-5-5"] as const) {
    const p = PRICES[model];
    assert.equal(askReserveMicro(10_000, model), Math.ceil((2 * 10_000 + 5 * 2000) * p.input + 2 * 6000 * p.output));
  }
  assert.equal(askReserveMicro(1000), askReserveMicro(1000, MODEL));
});

Deno.test("fakeAsker: first 3 refs at 80/60/40, Fake match., count 1000", async () => {
  const f = fakeAsker();
  assert.equal(await f.count(BOOKS, "p"), 1000);
  const r = await f.ask(BOOKS, "p", noRead);
  assert.deepEqual(r, {
    kind: "ok",
    result: {
      answerable: true,
      note: null,
      matches: [
        { book: 1, confidence: 80, reason: "Fake match." },
        { book: 2, confidence: 60, reason: "Fake match." },
        { book: 3, confidence: 40, reason: "Fake match." },
      ],
    },
    usage: { inputTokens: 0, outputTokens: 0, cacheCreationTokens: 0, cacheReadTokens: 0 },
    rounds: 1,
  });
});
