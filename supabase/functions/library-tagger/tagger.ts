// Tags one book with one Claude call (Plan 7 D1, D6, D9, D10), checks its
// series (Plan 10 D5), or audits the series it has (Plan 12 D10), searching the
// web only when the answer would otherwise be unsure and the caller allows it
// (Plan 11 D8). No SDK retries: every retry is a new claim, reserved and
// counted before the call, and a call that carried the search tool is never
// resumed or retried. Failures are classified by SDK class, status and error
// type, never by message. Nothing here logs.
import Anthropic from "@anthropic-ai/sdk";
import type { z } from "zod";
import {
  type AiFailure,
  type AiModel,
  classifyAiError,
  costMicro,
  fakeAllowed,
  thinkingFor,
  type Usage,
} from "../_shared/library-ai.ts";
import { type OutputFormat, outputFormat } from "../_shared/output-format.ts";
import { buildTagContent, TAG_SYSTEM_PROMPT, type TagInput, type TagResult, TagResultSchema, worstCaseTagTokens } from "./prompt.ts";
import {
  AUDIT_FORMAT,
  AUDIT_SEARCH_PROMPT,
  AUDIT_SYSTEM_PROMPT,
  type AuditInput,
  type AuditResult,
  type AuditVerdict,
  buildAuditContent,
  worstCaseAuditTokens,
} from "./audit.ts";
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
 * The most one audit's tool-less call can cost (Plan 12 D10): seriesCeilingMicro's
 * formula over worstCaseAuditTokens(), i.e. AUDIT_SYSTEM_PROMPT and
 * AUDIT_TEXT_ALLOWANCE (the series allowance plus the recorded line and the
 * neighbour labels). An audit job reserves SERIES_RESERVE_MICRO, which covers it.
 */
export function auditCeilingMicro(model: AiModel = MODEL): number {
  const w = worstCaseAuditTokens();
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

/**
 * Plan 12 D10: SeriesCall with the verdict and the raw answer (before
 * cleanAudit) in place of status and series. result is null when a search call
 * ended without an answer it could use (read as unsure).
 */
export type AuditCall =
  | {
    kind: "ok";
    verdict: AuditVerdict;
    result: AuditResult | null;
    usage: Usage;
    searched: boolean;
    searchFailure?: SearchFailure;
    unreadable?: Unreadable;
  }
  | Failed
  | (AiFailure & { usage?: Usage; unreadable?: Unreadable });

export interface Tagger {
  tag(input: TagInput): Promise<TagCall>;
  /** D8: allowSearch is true only for series claims on a database that sends same_author (D1). */
  findSeries(input: SeriesInput & { allowSearch: boolean }): Promise<SeriesCall>;
  /** Plan 12 D10: always two_step; allowSearch is always true for an audit claim. */
  auditSeries(input: AuditInput & { allowSearch: boolean }): Promise<AuditCall>;
}

export const TAG_FORMAT = outputFormat(TagResultSchema);
export const SERIES_FORMAT = outputFormat(SeriesResultSchema);
type SeriesResult = z.infer<typeof SeriesResultSchema>;

type Parsed<T> =
  | { kind: "ok"; value: T; usage: Usage }
  | Failed
  | AiFailure;

/**
 * What a search call gave: value null means unsure (it ended without an answer
 * it could use), with searchFailure when it may have been billed.
 */
type Searched<T> =
  | { kind: "ok"; value: T | null; usage: Usage; searchFailure?: SearchFailure }
  | Failed
  | (AiFailure & { usage?: Usage });

/** The prompt and format of one kind of search call; textJsonLine only for a kind that supports text_json. */
interface SearchSpec<T> {
  system: string;
  format: OutputFormat<T>;
  textJsonLine?: string;
}

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
      auditSeries: () => Promise.resolve({ kind: "misconfigured" }),
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
      // Paths name schema keys or array indexes only (true while no schema
      // uses z.record, whose keys the model writes); codes are zod's. No values.
      const issues = r.error.issues.slice(0, UNREADABLE_CAP)
        .map((i) => ({ path: i.path.map(String).join(".").slice(0, 80), code: i.code }));
      return unreadable("schema", issues);
    }
    return { kind: "ok", value: r.data, usage };
  }

  /**
   * One call with the search tool (D8), made once: never resumed after
   * pause_turn and never retried. pause_turn, max_tokens, a search error
   * object or an answer that does not parse all read as unsure (value null)
   * with the usage kept; a refusal is tag_refused. `before` is the usage of the
   * tool-less first call (two_step), or null when this is the check's only call
   * (single). Series checks and audits share it (Plan 12 D10): `spec` gives the
   * system prompt and the answer format.
   */
  async function searchCall<T>(content: unknown[], before: Usage | null, spec: SearchSpec<T>): Promise<Searched<T>> {
    const unsure = (usage: Usage, searchFailure?: SearchFailure): Searched<T> => ({
      kind: "ok",
      value: null,
      usage,
      ...(searchFailure ? { searchFailure } : {}),
    });
    const textJson = searchFormat === "text_json" && spec.textJsonLine !== undefined;
    let message: Anthropic.Message;
    try {
      message = await client.messages.create({
        model,
        max_tokens: SERIES_SEARCH_MAX_TOKENS,
        system: textJson ? `${spec.system}\n${spec.textJsonLine}` : spec.system,
        thinking,
        output_config: textJson
          ? { ...output_config }
          : { ...output_config, format: { type: "json_schema", schema: spec.format.schema } },
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
    const r = spec.format.zod.safeParse(parsed);
    if (!r.success) return unsure(usage);
    return { kind: "ok", value: r.data, usage };
  }

  const seriesSpec: SearchSpec<SeriesResult> = {
    system: SERIES_SEARCH_PROMPT,
    format: SERIES_FORMAT,
    textJsonLine: SEARCH_TEXT_JSON_LINE,
  };
  // No text_json line: an audit's search call always sends json_schema (D10).
  const auditSpec: SearchSpec<AuditResult> = { system: AUDIT_SEARCH_PROMPT, format: AUDIT_FORMAT };

  /** A series search call's result as a SeriesCall: no answer reads as unsure. */
  async function seriesSearch(content: unknown[], before: Usage | null): Promise<SeriesCall> {
    const s = await searchCall(content, before, seriesSpec);
    if (s.kind !== "ok") return s;
    const { value, usage, searchFailure } = s;
    return value
      ? { kind: "ok", status: value.series_status, series: value.series, usage, searched: true }
      : { kind: "ok", status: "unsure", series: null, usage, searched: true, ...(searchFailure ? { searchFailure } : {}) };
  }

  /** An audit search call's result as an AuditCall: no answer reads as unsure, with result null. */
  async function auditSearch(content: unknown[], before: Usage): Promise<AuditCall> {
    const s = await searchCall(content, before, auditSpec);
    if (s.kind !== "ok") return s;
    const { value, usage, searchFailure } = s;
    return value
      ? { kind: "ok", verdict: value.verdict, result: value, usage, searched: true }
      : { kind: "ok", verdict: "unsure", result: null, usage, searched: true, ...(searchFailure ? { searchFailure } : {}) };
  }

  return {
    async tag(input) {
      const r = await call(TAG_SYSTEM_PROMPT, MAX_TOKENS, TAG_FORMAT, buildTagContent(input));
      return r.kind === "ok" ? { kind: "ok", result: r.value, usage: r.usage } : r;
    },
    async findSeries(input) {
      const content = buildSeriesContent(input);
      if (input.allowSearch && searchMode === "single") return await seriesSearch(content, null);
      const r = await call(SERIES_SYSTEM_PROMPT, SERIES_MAX_TOKENS, SERIES_FORMAT, content);
      // two_step: a first reply that can't be read is taken as unsure, so it
      // earns the search call when allowed (2026-11-22). Failing the job would
      // leave the book blank until a later Find series queued it again, at the
      // same cost. What was wrong is kept, even when the search call is then
      // refused (error tag_refused, usage.unreadable about the first reply).
      if (r.kind === "fail" && r.code === "tag_unreadable" && input.allowSearch) {
        const searched = await seriesSearch(content, r.usage);
        return r.unreadable ? { ...searched, unreadable: r.unreadable } : searched;
      }
      if (r.kind !== "ok") return r;
      // two_step: only an unsure answer, and only when allowed, earns the search call.
      if (input.allowSearch && r.value.series_status === "unsure") return await seriesSearch(content, r.usage);
      return { kind: "ok", status: r.value.series_status, series: r.value.series, usage: r.usage, searched: false };
    },
    // findSeries' two_step for the audit (D10); SERIES_SEARCH_MODE is ignored.
    async auditSeries(input) {
      const content = buildAuditContent(input);
      const r = await call(AUDIT_SYSTEM_PROMPT, SERIES_MAX_TOKENS, AUDIT_FORMAT, content);
      // An unreadable first reply is taken as unsure, as for a series check, and keeps why.
      if (r.kind === "fail" && r.code === "tag_unreadable" && input.allowSearch) {
        const searched = await auditSearch(content, r.usage);
        return r.unreadable ? { ...searched, unreadable: r.unreadable } : searched;
      }
      if (r.kind !== "ok") return r;
      if (input.allowSearch && r.value.verdict === "unsure") return await auditSearch(content, r.usage);
      return { kind: "ok", verdict: r.value.verdict, result: r.value, usage: r.usage, searched: false };
    },
  };
}

/** fakeSeries's answer in the model's shape (a why is always given). */
function fakeRaw(title: string): RawSeries {
  const s = fakeSeries(title);
  return s ? { name: s.name, volume: s.volume, why: s.why ?? "" } : null;
}

/** Local runs only: never calls the API. Every method reads the series from the title (Plan 10 D6, Plan 12 D11). */
export function fakeTagger(): Tagger {
  return {
    // Never searches: wrong_number with the title's #n when it differs from the recorded number, else agree.
    auditSeries(input) {
      const s = fakeSeries(input.title);
      const result: AuditResult = s && s.volume !== null && s.volume !== input.recorded.volume
        ? { verdict: "wrong_number", name: null, volume: s.volume, why: "Fake number from the title." }
        : { verdict: "agree", name: null, volume: null, why: "Fake audit agrees." };
      return Promise.resolve({ kind: "ok", verdict: result.verdict, result, usage: { ...ZERO }, searched: false });
    },
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
