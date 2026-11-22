// Tags one book with one Claude call (Plan 7 D1, D6, D9, D10), or checks its
// series (Plan 10 D5), searching the web only when the answer would otherwise
// be unsure and the caller allows it (Plan 11 D8). No SDK retries: every retry
// is a new claim, reserved and counted before the call, and a call that
// carried the search tool is never resumed or retried. Failures are classified
// by SDK class, status and error type, never by message. Nothing here logs.
import Anthropic from "@anthropic-ai/sdk";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { z } from "zod";
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
import {
  buildSeriesContent,
  fakeSeries,
  SERIES_SEARCH_PROMPT,
  SERIES_SYSTEM_PROMPT,
  type SeriesInput,
  SeriesResultSchema,
  type SeriesStatus,
  worstCaseSeriesTokens,
} from "./series.ts";

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
 *   ceil( plain x in + (vocab + series) x 1.25 x in + MAX_TOKENS x out )
 * where worstCaseTagTokens() gives
 *   plain = ceil(system prompt chars / 3) + 4,800 (one image)
 *           + the allowances (book text, card, same-author books and Open Library line) + 1,000 (framing and the
 *           structured-output instructions), at the input rate;
 *   vocab = ceil(vocabulary block chars / 3) at its caps (120 ToS ids and
 *           578 library ids, 40 characters each), at the 1.25x cache-write
 *           rate, since that block carries cache_control;
 *   series = ceil(household series block chars / 3) at its caps (Plan 10 D4),
 *           also cache-written, so at the same 1.25x rate.
 * Thinking shares max_tokens, so output never exceeds MAX_TOKENS.
 */
export function ceilingMicro(model: AiModel = MODEL): number {
  const w = worstCaseTagTokens();
  return costMicro(model, { inputTokens: w.plain, cacheCreationTokens: w.vocab + w.series, cacheReadTokens: 0, outputTokens: MAX_TOKENS });
}

/** Must equal library.tag_reserve_micro(): ceilingMicro(MODEL) rounded up to 1,000. */
export const TAG_RESERVE_MICRO = Math.ceil(ceilingMicro(MODEL) / 1000) * 1000;

/** A series check is text only and its answer is a few dozen tokens (Plan 10 D5). */
export const SERIES_MAX_TOKENS = 1024;

/**
 * The most one series check can cost, in micro-dollars (Plan 10 D5):
 *   ceil( plain x in + block x 1.25 x in + SERIES_MAX_TOKENS x out )
 * where worstCaseSeriesTokens() gives
 *   plain = ceil(SERIES_SYSTEM_PROMPT chars / 3) + SERIES_TEXT_ALLOWANCE
 *           + REQUEST_OVERHEAD_TOKENS (1,000), at the input rate;
 *   block = ceil(household series block chars / 3) at its cap, at the 1.25x
 *           cache-write rate, since that block carries cache_control.
 */
export function seriesCeilingMicro(model: AiModel = MODEL): number {
  const w = worstCaseSeriesTokens();
  return costMicro(model, { inputTokens: w.plain, cacheCreationTokens: w.block, cacheReadTokens: 0, outputTokens: SERIES_MAX_TOKENS });
}

/**
 * Must equal library.series_reserve_micro(). D10's rule is max(seriesCeilingMicro
 * rounded up to 1,000, 2.5 x the measured worst series-job cost with two
 * searches). Task 6 (2026-11-19) measured that worst job at 40,257, so the rule
 * gives 101,000. That was measured on invented books only, whose searches find
 * little, so the reserve stays at 150,000 until real-book searches are measured.
 */
export const SERIES_RESERVE_MICRO = 150_000;

/**
 * D8: which search mechanism series checks use. Task 6 measured two_step as the
 * cheaper one: found and none answers never pay for the tool prefix.
 */
export const SERIES_SEARCH_MODE: "two_step" | "single" = "two_step";

/**
 * D8: the web search tool, with dynamic filtering (the 20260318 version) and
 * the filtered-away result blocks left out of the response. At most two searches.
 */
export const SEARCH_TOOL = {
  type: "web_search_20260318",
  name: "web_search",
  max_uses: 2,
  response_inclusion: "excluded",
} as const;

/**
 * D8: json_schema sends output_config.format with the tool, as every other
 * call; text_json (if the API rejects the format alongside the tool) asks for
 * JSON in the prompt instead. Task 6's probe: json_schema is accepted with the tool.
 */
export const SEARCH_FORMAT: "json_schema" | "text_json" = "json_schema";

/** The extra system line for text_json (D8). */
export const SEARCH_TEXT_JSON_LINE = 'Answer with only a JSON object {"series": …, "series_status": …}.';

/** D8: thinking at low effort plus the filtering code. Task 6's largest searching output was 441 tokens. */
export const SERIES_SEARCH_MAX_TOKENS = 4096;

/**
 * Why a reply could not be read, with no book text in it (2026-11-22): the
 * reason, the reply's block types, the length of its text, its stop_reason,
 * and for a schema miss the paths and codes of zod's issues, never the values.
 */
export interface Unreadable {
  reason: "max_tokens" | "no_text" | "not_json" | "schema";
  blocks: string[];
  textChars: number;
  stopReason: string | null;
  issues?: { path: string; code: string }[];
}

type Failed = { kind: "fail"; code: "tag_refused" | "tag_unreadable"; usage: Usage; unreadable?: Unreadable };

export type TagCall =
  | { kind: "ok"; result: TagResult; usage: Usage }
  | Failed
  | AiFailure;

/** The series as the model returns it, before sanitizeSeries. */
export type RawSeries = { name: string; volume: number | null; why: string } | null;

/**
 * Why a search call ended without an answer it could use: billed_unknown when
 * it may have been billed (a connection error or timeout). The call is not
 * retried; the job finishes unsure at no less than its reserve. Unbilled
 * failures are returned as AiFailures instead, so the job is released.
 */
export type SearchFailure = "billed_unknown";

/** unreadable, on any of these: the two_step first reply that could not be read, so the search call was made. */
export type SeriesCall =
  | {
    kind: "ok";
    status: SeriesStatus;
    series: RawSeries;
    usage: Usage;
    searched: boolean;
    searchFailure?: SearchFailure;
    unreadable?: Unreadable;
  }
  | Failed
  /** usage: a billed two_step first call before an unbilled search-call failure. */
  | (AiFailure & { usage?: Usage; unreadable?: Unreadable });

export interface Tagger {
  tag(input: TagInput): Promise<TagCall>;
  /** D8: allowSearch is true only for series claims on a database that sends same_author (D1). */
  findSeries(input: SeriesInput & { allowSearch: boolean }): Promise<SeriesCall>;
}

type Json = Record<string, unknown>;
const isObject = (v: unknown): v is Json => typeof v === "object" && v !== null && !Array.isArray(v);

/**
 * The SDK's transformJSONSchema (1.3.0) keeps only `format` on a string and
 * moves every other keyword into the description, `enum` included, though
 * structured outputs support enum. So series_status went to the API as any
 * string (2026-11-22). This puts each enum of zod's own JSON schema back on the
 * matching node and takes the "{enum: [...]}" the SDK wrote off its description.
 */
function restoreEnums(out: unknown, raw: unknown): void {
  if (!isObject(out) || !isObject(raw)) return;
  if (Array.isArray(raw.enum) && !("enum" in out)) {
    out.enum = raw.enum;
    const moved = `{enum: ${JSON.stringify(raw.enum)}}`;
    if (out.description === moved) delete out.description;
    else if (typeof raw.description === "string" && out.description === `${raw.description}\n\n${moved}`) {
      out.description = raw.description;
    }
  }
  for (const key of ["properties", "$defs"]) {
    const o = out[key], r = raw[key];
    if (isObject(o) && isObject(r)) for (const k of Object.keys(r)) restoreEnums(o[k], r[k]);
  }
  // The SDK sends a oneOf as anyOf.
  const variants = out.anyOf ?? out.allOf;
  const rawVariants = raw.anyOf ?? raw.oneOf ?? raw.allOf;
  if (Array.isArray(variants) && Array.isArray(rawVariants)) variants.forEach((v, i) => restoreEnums(v, rawVariants[i]));
  restoreEnums(out.items, raw.items);
}

/** A reply format: the JSON schema sent as output_config.format, and the zod schema the reply is checked against. */
export interface OutputFormat<T> {
  schema: Json;
  zod: z.ZodType<T>;
}

/** zodOutputFormat's schema with its enums restored (see restoreEnums). */
export function outputFormat<T>(schema: z.ZodType<T>): OutputFormat<T> {
  const sent = zodOutputFormat(schema).schema as Json;
  restoreEnums(sent, z.toJSONSchema(schema, { reused: "ref" }));
  return { schema: sent, zod: schema };
}

export const TAG_FORMAT = outputFormat(TagResultSchema);
export const SERIES_FORMAT = outputFormat(SeriesResultSchema);

type Parsed<T> =
  | { kind: "ok"; value: T; usage: Usage }
  | Failed
  | AiFailure;

/** At most this many block types and zod issues go into an Unreadable. */
const UNREADABLE_CAP = 10;

/** The four token counts, plus webSearchRequests when any search was billed (D10). */
export function usageOf(u: Anthropic.Usage): Usage {
  const usage: Usage = {
    inputTokens: u.input_tokens ?? 0,
    outputTokens: u.output_tokens ?? 0,
    cacheCreationTokens: u.cache_creation_input_tokens ?? 0,
    cacheReadTokens: u.cache_read_input_tokens ?? 0,
  };
  const searches = (u as { server_tool_use?: { web_search_requests?: unknown } | null }).server_tool_use?.web_search_requests;
  if (typeof searches === "number" && Number.isFinite(searches) && searches > 0) usage.webSearchRequests = searches;
  return usage;
}

const ZERO: Usage = { inputTokens: 0, outputTokens: 0, cacheCreationTokens: 0, cacheReadTokens: 0 };

/** Two calls' usage summed; webSearchRequests appears only when either had searches. */
function addUsage(a: Usage, b: Usage): Usage {
  const sum: Usage = {
    inputTokens: a.inputTokens + b.inputTokens,
    outputTokens: a.outputTokens + b.outputTokens,
    cacheCreationTokens: a.cacheCreationTokens + b.cacheCreationTokens,
    cacheReadTokens: a.cacheReadTokens + b.cacheReadTokens,
  };
  const searches = (a.webSearchRequests ?? 0) + (b.webSearchRequests ?? 0);
  if (searches > 0) sum.webSearchRequests = searches;
  return sum;
}

type Block = { type: string; text?: unknown; content?: unknown };

/** Result blocks of server tools (web search, the filtering code) end in _tool_result. */
const isToolResult = (b: Block) => b.type.endsWith("_tool_result");

/** A web_search_tool_result whose content is an error object rather than a list (D8). */
const isSearchError = (b: Block) => b.type === "web_search_tool_result" && !Array.isArray(b.content);

/** The concatenated text blocks after the last tool-result block (D8). */
function answerText(blocks: Block[]): string {
  let start = 0;
  blocks.forEach((b, i) => {
    if (isToolResult(b)) start = i + 1;
  });
  return blocks.slice(start).flatMap((b) => b.type === "text" && typeof b.text === "string" ? [b.text] : []).join("");
}

export function anthropicTagger(
  apiKey: string | undefined,
  opts: {
    model?: AiModel;
    fetchImpl?: typeof fetch;
    /** Tests and Task 6's measurement only; production uses the constants. */
    searchMode?: typeof SERIES_SEARCH_MODE;
    searchFormat?: typeof SEARCH_FORMAT;
  } = {},
): Tagger {
  if (!apiKey) {
    return {
      tag: () => Promise.resolve({ kind: "misconfigured" }),
      findSeries: () => Promise.resolve({ kind: "misconfigured" }),
    };
  }
  const model = opts.model ?? MODEL;
  const client = new Anthropic({
    apiKey,
    maxRetries: 0,
    timeout: TIMEOUT_MS,
    ...(opts.fetchImpl ? { fetch: opts.fetchImpl } : {}),
  });
  const { thinking, output_config } = thinkingFor(model, "low");
  const searchMode = opts.searchMode ?? SERIES_SEARCH_MODE;
  const searchFormat = opts.searchFormat ?? SEARCH_FORMAT;

  /** One call with the same model and thinking; the reply is checked against `format`. */
  async function call<T>(
    system: string,
    maxTokens: number,
    format: OutputFormat<T>,
    content: unknown[],
  ): Promise<Parsed<T>> {
    let message: Anthropic.Message;
    try {
      // messages.parse would throw on a refusal's or a truncated reply's text
      // before stop_reason could be checked, losing the billed usage, so the
      // reply is validated here against the same schema.
      message = await client.messages.create({
        model,
        max_tokens: maxTokens,
        system,
        thinking,
        output_config: { ...output_config, format: { type: "json_schema", schema: format.schema } },
        messages: [{ role: "user", content: content as Anthropic.ContentBlockParam[] }],
      } as Anthropic.MessageCreateParamsNonStreaming);
    } catch (err) {
      return classifyAiError(err);
    }

    const usage = usageOf(message.usage);
    if (message.stop_reason === "refusal") return { kind: "fail", code: "tag_refused", usage };

    // Every text block, joined, so an answer split across blocks still reads.
    const blocks = message.content as unknown as Block[];
    const text = answerText(blocks);
    const unreadable = (reason: Unreadable["reason"], issues?: Unreadable["issues"]): Parsed<T> => ({
      kind: "fail",
      code: "tag_unreadable",
      usage,
      unreadable: {
        reason,
        blocks: blocks.slice(0, UNREADABLE_CAP).map((b) => String(b.type).slice(0, 40)),
        textChars: text.length,
        stopReason: message.stop_reason ?? null,
        ...(issues ? { issues } : {}),
      },
    });
    if (message.stop_reason === "max_tokens") return unreadable("max_tokens");
    if (!blocks.some((b) => b.type === "text" && typeof b.text === "string")) return unreadable("no_text");
    let json: unknown;
    try {
      json = JSON.parse(text);
    } catch {
      return unreadable("not_json");
    }
    const r = format.zod.safeParse(json);
    if (!r.success) {
      // Paths name schema keys or array indexes only; codes are zod's. No values.
      const issues = r.error.issues.slice(0, UNREADABLE_CAP)
        .map((i) => ({ path: i.path.map(String).join(".").slice(0, 80), code: i.code }));
      return unreadable("schema", issues);
    }
    return { kind: "ok", value: r.data, usage };
  }

  /**
   * One call with the search tool (D8), made once: never resumed after
   * pause_turn and never retried. pause_turn, max_tokens, a search error
   * object or an answer that does not parse all read as unsure with the usage
   * kept; a refusal is tag_refused. `before` is the usage of the tool-less
   * first call (two_step), or null when this is the check's only call (single).
   */
  async function searchCall(content: unknown[], before: Usage | null): Promise<SeriesCall> {
    const unsure = (usage: Usage, searchFailure?: SearchFailure): SeriesCall => ({
      kind: "ok",
      status: "unsure",
      series: null,
      usage,
      searched: true,
      ...(searchFailure ? { searchFailure } : {}),
    });
    const textJson = searchFormat === "text_json";
    let message: Anthropic.Message;
    try {
      message = await client.messages.create({
        model,
        max_tokens: SERIES_SEARCH_MAX_TOKENS,
        system: textJson ? `${SERIES_SEARCH_PROMPT}\n${SEARCH_TEXT_JSON_LINE}` : SERIES_SEARCH_PROMPT,
        thinking,
        output_config: textJson
          ? { ...output_config }
          : { ...output_config, format: { type: "json_schema", schema: SERIES_FORMAT.schema } },
        tools: [SEARCH_TOOL],
        messages: [{ role: "user", content: content as Anthropic.ContentBlockParam[] }],
      } as unknown as Anthropic.MessageCreateParamsNonStreaming);
    } catch (err) {
      const failure = classifyAiError(err);
      // A failure that cannot have been billed ran no search, so the job is
      // released as for any call: retried within its attempts, or failed
      // visibly (tag_rejected). The check keeps its one search. After a
      // two_step first call, the failure carries that call's usage, so the
      // release records what it cost. Only a failure that may have been
      // billed finishes unsure, so a search that may have run is never retried.
      const unbilled = failure.kind !== "retry" || !failure.billedUnknown;
      if (unbilled) return before === null ? failure : { ...failure, usage: before };
      return unsure(before ?? { ...ZERO }, "billed_unknown");
    }

    const usage = addUsage(before ?? ZERO, usageOf(message.usage));
    if (message.stop_reason === "refusal") return { kind: "fail", code: "tag_refused", usage };
    if (message.stop_reason !== "end_turn" && message.stop_reason !== "stop_sequence") return unsure(usage);
    const blocks = message.content as unknown as Block[];
    if (blocks.some(isSearchError)) return unsure(usage);
    let parsed: unknown;
    try {
      parsed = JSON.parse(answerText(blocks));
    } catch {
      return unsure(usage);
    }
    const r = SeriesResultSchema.safeParse(parsed);
    if (!r.success) return unsure(usage);
    return { kind: "ok", status: r.data.series_status, series: r.data.series, usage, searched: true };
  }

  return {
    async tag(input) {
      const r = await call(TAG_SYSTEM_PROMPT, MAX_TOKENS, TAG_FORMAT, buildTagContent(input));
      return r.kind === "ok" ? { kind: "ok", result: r.value, usage: r.usage } : r;
    },
    async findSeries(input) {
      const content = buildSeriesContent(input);
      if (input.allowSearch && searchMode === "single") return await searchCall(content, null);
      const r = await call(SERIES_SYSTEM_PROMPT, SERIES_MAX_TOKENS, SERIES_FORMAT, content);
      // two_step: a first reply that can't be read is taken as unsure, so it
      // earns the search call when allowed (2026-11-22). Failing the job would
      // only send it round again at the same cost. What was wrong is kept.
      if (r.kind === "fail" && r.code === "tag_unreadable" && input.allowSearch) {
        const searched = await searchCall(content, r.usage);
        return r.unreadable ? { ...searched, unreadable: r.unreadable } : searched;
      }
      if (r.kind !== "ok") return r;
      // two_step: only an unsure answer, and only when allowed, earns the search call.
      if (input.allowSearch && r.value.series_status === "unsure") return await searchCall(content, r.usage);
      return { kind: "ok", status: r.value.series_status, series: r.value.series, usage: r.usage, searched: false };
    },
  };
}

/** fakeSeries's answer in the model's shape (a why is always given). */
function fakeRaw(title: string): RawSeries {
  const s = fakeSeries(title);
  return s ? { name: s.name, volume: s.volume, why: s.why ?? "" } : null;
}

/** Local runs only: never calls the API. Both methods read the series from the title (Plan 10 D6). */
export function fakeTagger(): Tagger {
  return {
    // Never searches: found when the title reads as a series, else none.
    findSeries(input) {
      const series = fakeRaw(input.title);
      return Promise.resolve({ kind: "ok", status: series ? "found" : "none", series, usage: { ...ZERO }, searched: false });
    },
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
          series: fakeRaw(input.title),
          series_status: fakeRaw(input.title) ? "found" : "none",
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
