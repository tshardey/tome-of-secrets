// Tags one book with one Claude call (Plan 7 D1, D6, D9, D10). No SDK retries:
// every retry is a new claim, reserved and counted before the call. Failures
// are classified by SDK class, status and error type, never by message.
// Nothing here logs.
import Anthropic from "@anthropic-ai/sdk";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import {
  type AiFailure,
  type AiModel,
  classifyAiError,
  costMicro,
  fakeAllowed,
  thinkingFor,
  type Usage,
} from "../_shared/library-ai.ts";
import { buildTagContent, TAG_SYSTEM_PROMPT, type TagInput, type TagResult, TagResultSchema, worstCaseTagTokens } from "./prompt.ts";

/** Set from the Task 2 measurement (Sonnet 5.5 vs Haiku 5.5 on the synthetic set). */
export const MODEL: AiModel = "claude-sonnet-5-5";
/**
 * 2,048 by the coordinator's ruling after Task 2: the largest measured output
 * (adaptive thinking at effort low included) was 258 tokens, about 8x headroom.
 */
export const MAX_TOKENS = 2048;
const TIMEOUT_MS = 120_000;

/**
 * The most one tagging call can cost, in micro-dollars (D6):
 *   ceil( plain x in + vocab x 1.25 x in + MAX_TOKENS x out )
 * where worstCaseTagTokens() gives
 *   plain = ceil(system prompt chars / 3) + 4,800 (one image)
 *           + 6,000 (book text and card) + 1,000 (framing and the
 *           structured-output instructions), at the input rate;
 *   vocab = ceil(vocabulary block chars / 3) at its caps (120 ToS ids and
 *           576 library ids, 40 characters each), at the 1.25x cache-write
 *           rate, since that block carries cache_control.
 * Thinking shares max_tokens, so output never exceeds MAX_TOKENS.
 */
export function ceilingMicro(model: AiModel = MODEL): number {
  const w = worstCaseTagTokens();
  return costMicro(model, { inputTokens: w.plain, cacheCreationTokens: w.vocab, cacheReadTokens: 0, outputTokens: MAX_TOKENS });
}

/** Must equal library.tag_reserve_micro(): ceilingMicro(MODEL) rounded up to 1,000. */
export const TAG_RESERVE_MICRO = 71_000;

export type TagCall =
  | { kind: "ok"; result: TagResult; usage: Usage }
  | { kind: "fail"; code: "tag_refused" | "tag_unreadable"; usage: Usage }
  | AiFailure;

export interface Tagger {
  tag(input: TagInput): Promise<TagCall>;
}

const FORMAT = zodOutputFormat(TagResultSchema);

export function usageOf(u: Anthropic.Usage): Usage {
  return {
    inputTokens: u.input_tokens ?? 0,
    outputTokens: u.output_tokens ?? 0,
    cacheCreationTokens: u.cache_creation_input_tokens ?? 0,
    cacheReadTokens: u.cache_read_input_tokens ?? 0,
  };
}

export function anthropicTagger(
  apiKey: string | undefined,
  opts: { model?: AiModel; fetchImpl?: typeof fetch } = {},
): Tagger {
  if (!apiKey) return { tag: () => Promise.resolve({ kind: "misconfigured" }) };
  const model = opts.model ?? MODEL;
  const client = new Anthropic({
    apiKey,
    maxRetries: 0,
    timeout: TIMEOUT_MS,
    ...(opts.fetchImpl ? { fetch: opts.fetchImpl } : {}),
  });
  const { thinking, output_config } = thinkingFor(model, "low");

  return {
    async tag(input) {
      let message: Anthropic.Message;
      try {
        // messages.parse would throw on a refusal's or a truncated reply's text
        // before stop_reason could be checked, losing the billed usage, so the
        // reply is validated here against the same schema.
        message = await client.messages.create({
          model,
          max_tokens: MAX_TOKENS,
          system: TAG_SYSTEM_PROMPT,
          thinking,
          output_config: { ...output_config, format: { type: "json_schema", schema: FORMAT.schema } },
          messages: [{ role: "user", content: buildTagContent(input) as Anthropic.ContentBlockParam[] }],
        } as Anthropic.MessageCreateParamsNonStreaming);
      } catch (err) {
        return classifyAiError(err);
      }

      const usage = usageOf(message.usage);
      if (message.stop_reason === "refusal") return { kind: "fail", code: "tag_refused", usage };
      if (message.stop_reason === "max_tokens") return { kind: "fail", code: "tag_unreadable", usage };

      const text = message.content.find((b): b is Anthropic.TextBlock => b.type === "text")?.text;
      let parsed: TagResult | null = null;
      if (text !== undefined) {
        try {
          parsed = FORMAT.parse(text) as TagResult;
        } catch {
          parsed = null;
        }
      }
      if (!parsed) return { kind: "fail", code: "tag_unreadable", usage };
      return { kind: "ok", result: parsed, usage };
    },
  };
}

const ZERO: Usage = { inputTokens: 0, outputTokens: 0, cacheCreationTokens: 0, cacheReadTokens: 0 };

/** Local runs only: never calls the API. */
export function fakeTagger(): Tagger {
  return {
    tag(input) {
      const image = input.kind === "full" && input.image !== null;
      return Promise.resolve({
        kind: "ok",
        result: {
          tos_tags: ["fantasy"],
          library_tags: image ? ["cover-blue"] : [],
          summary: "A fake summary written by the local tagger.",
          cover_description: image ? "A plain blue cover." : null,
          suggestions: [],
        },
        usage: { ...ZERO },
      });
    },
  };
}

/** The fake runs only when asked for and only against a local stack (D8). */
export function chooseTagger(getEnv: (name: string) => string | undefined): "fake" | "anthropic" {
  return fakeAllowed(getEnv, "LIBRARY_TAGGER_FAKE") ? "fake" : "anthropic";
}
