// Answers one Ask prompt over a household's book list (Plan 7 D1, D6, D9,
// D10): at most two requests, the second only to answer one read_descriptions
// call, with tool_choice none. No SDK retries; Ask never retries by itself.
// Failures are classified by SDK class, status and error type, never by
// message. Nothing here logs.
import Anthropic from "@anthropic-ai/sdk";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import {
  type AiFailure,
  type AiModel,
  classifyAiError,
  clip,
  escapeData,
  fakeAllowed,
  PRICES,
  thinkingFor,
  type Usage,
} from "../_shared/library-ai.ts";
import {
  ASK_LIMITS,
  ASK_SYSTEM_PROMPT,
  type AskBook,
  type AskResult,
  AskResultSchema,
  buildAskList,
  READ_DESCRIPTIONS_TOOL,
} from "./prompt.ts";

/** Set from the Task 2 measurement (Sonnet 5.5 vs Haiku 5.5 on the synthetic set). */
export const MODEL: AiModel = "claude-sonnet-5-5";
export const MAX_TOKENS = 6000;
const TIMEOUT_MS = 120_000;
/** Descriptions read at most in the one tool call. */
const MAX_READS = 5;

/**
 * D6, exact: ceil((2t + 5 x 2,000) x in + 2 x 6,000 x out) in micro-dollars,
 * where t is the counted input: two requests at the full input price, five
 * descriptions of at most 2,000 characters, and two full outputs.
 */
export function askReserveMicro(inputTokens: number, model: AiModel = MODEL): number {
  const p = PRICES[model];
  return Math.ceil((2 * inputTokens + MAX_READS * ASK_LIMITS.description) * p.input + 2 * MAX_TOKENS * p.output);
}

export type AskCall =
  | { kind: "ok"; result: AskResult; usage: Usage; rounds: 1 | 2 }
  | { kind: "fail"; code: "ask_refused" | "ask_unreadable"; usage: Usage }
  | AiFailure;

export interface Asker {
  /** messages.countTokens over the round-1 request (free). Rejects with the SDK error. */
  count(books: AskBook[], prompt: string): Promise<number>;
  ask(
    books: AskBook[],
    prompt: string,
    readDescriptions: (refs: number[]) => Promise<Map<number, string>>,
  ): Promise<AskCall>;
}

const FORMAT = zodOutputFormat(AskResultSchema);
const ZERO: Usage = { inputTokens: 0, outputTokens: 0, cacheCreationTokens: 0, cacheReadTokens: 0 };

function usageOf(u: Anthropic.Usage): Usage {
  return {
    inputTokens: u.input_tokens ?? 0,
    outputTokens: u.output_tokens ?? 0,
    cacheCreationTokens: u.cache_creation_input_tokens ?? 0,
    cacheReadTokens: u.cache_read_input_tokens ?? 0,
  };
}

function add(a: Usage, b: Usage): Usage {
  return {
    inputTokens: a.inputTokens + b.inputTokens,
    outputTokens: a.outputTokens + b.outputTokens,
    cacheCreationTokens: a.cacheCreationTokens + b.cacheCreationTokens,
    cacheReadTokens: a.cacheReadTokens + b.cacheReadTokens,
  };
}

/** The list (cached, D9), then the escaped prompt last. */
function firstMessage(books: AskBook[], prompt: string): Anthropic.MessageParam {
  return {
    role: "user",
    content: [
      { type: "text", text: buildAskList(books), cache_control: { type: "ephemeral" } },
      { type: "text", text: `Prompt: <prompt>${escapeData(clip(prompt.trim(), ASK_LIMITS.prompt))}</prompt>` },
    ],
  };
}

/** Refs 1..n, integers, first occurrence, at most 5, in the order asked. */
function refsToRead(input: unknown, n: number): number[] {
  const raw = (input as { books?: unknown } | null)?.books;
  if (!Array.isArray(raw)) return [];
  const out: number[] = [];
  for (const r of raw) {
    if (out.length >= MAX_READS) break;
    if (typeof r === "number" && Number.isInteger(r) && r >= 1 && r <= n && !out.includes(r)) out.push(r);
  }
  return out;
}

function descriptionsText(refs: number[], found: Map<number, string>): string {
  if (refs.length === 0) return "No listed books were asked for.";
  return refs.map((r) => {
    const d = found.get(r);
    return d && d.trim()
      ? `[${r}] <description>${escapeData(clip(d.trim(), ASK_LIMITS.description))}</description>`
      : `[${r}] no description`;
  }).join("\n");
}

function parseResult(message: Anthropic.Message): AskResult | null {
  const text = message.content.find((b): b is Anthropic.TextBlock => b.type === "text")?.text;
  if (text === undefined) return null;
  try {
    return FORMAT.parse(text) as AskResult;
  } catch {
    return null;
  }
}

/** A stop that isn't a readable answer, or null when the reply can be parsed. */
function badStop(message: Anthropic.Message, usage: Usage): AskCall | null {
  if (message.stop_reason === "refusal") return { kind: "fail", code: "ask_refused", usage };
  if (message.stop_reason === "max_tokens") return { kind: "fail", code: "ask_unreadable", usage };
  return null;
}

/** The SDK's 401 class, so callers classify a missing key like a rejected one. */
function missingKeyError(): Error {
  return new Anthropic.AuthenticationError(401, undefined, "missing API key", new Headers());
}

export function anthropicAsker(
  apiKey: string | undefined,
  opts: { model?: AiModel; fetchImpl?: typeof fetch } = {},
): Asker {
  if (!apiKey) {
    return {
      count: () => Promise.reject(missingKeyError()),
      ask: () => Promise.resolve({ kind: "misconfigured" }),
    };
  }
  const model = opts.model ?? MODEL;
  const client = new Anthropic({
    apiKey,
    maxRetries: 0,
    timeout: TIMEOUT_MS,
    ...(opts.fetchImpl ? { fetch: opts.fetchImpl } : {}),
  });
  const { thinking, output_config } = thinkingFor(model, "medium");
  const tools = [READ_DESCRIPTIONS_TOOL] as unknown as Anthropic.Tool[];
  const base = {
    model,
    max_tokens: MAX_TOKENS,
    system: ASK_SYSTEM_PROMPT,
    thinking,
    output_config: { ...output_config, format: { type: "json_schema", schema: FORMAT.schema } },
    tools,
  };
  const create = (extra: Record<string, unknown>) =>
    client.messages.create({ ...base, ...extra } as unknown as Anthropic.MessageCreateParamsNonStreaming);

  return {
    async count(books, prompt) {
      const r = await client.messages.countTokens({
        model,
        system: ASK_SYSTEM_PROMPT,
        thinking,
        output_config: base.output_config,
        tools,
        messages: [firstMessage(books, prompt)],
      } as unknown as Anthropic.MessageCountTokensParams);
      return r.input_tokens;
    },

    async ask(books, prompt, readDescriptions) {
      const first = firstMessage(books, prompt);
      let m1: Anthropic.Message;
      try {
        m1 = await create({ messages: [first] });
      } catch (err) {
        return classifyAiError(err);
      }
      const u1 = usageOf(m1.usage);
      const stop1 = badStop(m1, u1);
      if (stop1) return stop1;

      const uses = m1.content.filter((b): b is Anthropic.ToolUseBlock => b.type === "tool_use");
      if (m1.stop_reason !== "tool_use" || uses.length === 0) {
        const result = parseResult(m1);
        return result ? { kind: "ok", result, usage: u1, rounds: 1 } : { kind: "fail", code: "ask_unreadable", usage: u1 };
      }

      // One read, for the first call; any further call in the same turn is told no.
      const refs = refsToRead(uses[0].input, books.length);
      // Round 1 is already billed, so a failed read must not lose its usage:
      // the model is told the descriptions are unavailable and still answers.
      let found = new Map<number, string>();
      let readFailed = false;
      if (refs.length) {
        try {
          found = await readDescriptions(refs);
        } catch {
          readFailed = true;
        }
      }
      const results: Anthropic.ToolResultBlockParam[] = uses.map((u, i) =>
        i === 0
          ? readFailed
            ? { type: "tool_result", tool_use_id: u.id, content: "Descriptions are unavailable.", is_error: true }
            : { type: "tool_result", tool_use_id: u.id, content: descriptionsText(refs, found) }
          : { type: "tool_result", tool_use_id: u.id, content: "read_descriptions may be called once.", is_error: true }
      );

      let m2: Anthropic.Message;
      try {
        m2 = await create({
          messages: [first, { role: "assistant", content: m1.content }, { role: "user", content: results }],
          tool_choice: { type: "none" },
        });
      } catch (err) {
        // Round 1 was billed, so a failure now is billed at the reservation
        // (which covers it) unless the account itself is out of credit.
        const c = classifyAiError(err);
        return c.kind === "billing" ? c : { kind: "retry", retryAfterSeconds: null, billedUnknown: true };
      }
      const usage = add(u1, usageOf(m2.usage));
      const stop2 = badStop(m2, usage);
      if (stop2) return stop2;
      // A second tool call is never answered: at most two requests per Ask.
      if (m2.stop_reason === "tool_use") return { kind: "fail", code: "ask_unreadable", usage };
      const result = parseResult(m2);
      return result ? { kind: "ok", result, usage, rounds: 2 } : { kind: "fail", code: "ask_unreadable", usage };
    },
  };
}

/** Local runs only: never calls the API. */
export function fakeAsker(): Asker {
  const confidences = [80, 60, 40];
  return {
    count: () => Promise.resolve(1000),
    ask: (books) =>
      Promise.resolve({
        kind: "ok",
        result: {
          answerable: true,
          note: null,
          matches: books.slice(0, 3).map((b, i) => ({ book: b.ref, confidence: confidences[i], reason: "Fake match." })),
        },
        usage: { ...ZERO },
        rounds: 1,
      }),
  };
}

/** The fake runs only when asked for and only against a local stack (D8). */
export function chooseAsker(getEnv: (name: string) => string | undefined): "fake" | "anthropic" {
  return fakeAllowed(getEnv, "LIBRARY_ASK_FAKE") ? "fake" : "anthropic";
}
