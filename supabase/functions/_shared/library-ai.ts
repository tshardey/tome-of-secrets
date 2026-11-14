// Shared by library-tagger and library-ask (Plan 7 D6, D8): cost, error
// classification, backoff, text escaping and the thinking/effort request
// shape. library-covers and library-intake keep their own copies.
//
// Nothing here logs. Callers log an error name or code only, never titles,
// authors, descriptions, prompts or tags.
import Anthropic from "@anthropic-ai/sdk";

export type AiModel = "claude-sonnet-5-5" | "claude-haiku-5-5";

/** $ per million tokens. Micro-dollars = tokens x $/MTok. */
export const PRICES: Record<AiModel, { input: number; output: number }> = {
  "claude-sonnet-5-5": { input: 2, output: 10 },
  "claude-haiku-5-5": { input: 0.1, output: 0.5 },
};

export interface Usage {
  inputTokens: number;
  outputTokens: number;
  cacheCreationTokens: number;
  cacheReadTokens: number;
}

/**
 * ceil(in x p + cacheCreation x 1.25p + cacheRead x 0.1p + out x po), in
 * micro-dollars, unclamped. Cache writes cost 1.25x the input price and cache
 * reads 0.1x.
 */
export function costMicro(model: AiModel, u: Usage): number {
  const p = PRICES[model];
  return Math.ceil(
    u.inputTokens * p.input +
      u.cacheCreationTokens * 1.25 * p.input +
      u.cacheReadTokens * 0.1 * p.input +
      u.outputTokens * p.output,
  );
}

export type AiFailure =
  | { kind: "retry"; retryAfterSeconds: number | null; billedUnknown: boolean }
  | { kind: "misconfigured" }
  | { kind: "billing" }
  | { kind: "rejected" };

function retryAfterSeconds(headers: Headers | undefined): number | null {
  const raw = headers?.get("retry-after")?.trim();
  if (!raw) return null;
  if (/^\d+(\.\d+)?$/.test(raw)) return Math.ceil(Number(raw));
  const at = Date.parse(raw);
  if (Number.isNaN(at)) return null;
  return Math.max(0, Math.ceil((at - Date.now()) / 1000));
}

const unknownBilling: AiFailure = { kind: "retry", retryAfterSeconds: null, billedUnknown: true };

/**
 * Plan 5 D7 order, by SDK class, status and error type, never by message:
 * connection error and timeout; 402 or billing_error; 401/403/404;
 * 408/409/429/5xx; any other 4xx. Anything that isn't an APIError may have
 * been billed, so it is a retry at the full reservation.
 */
export function classifyAiError(err: unknown): AiFailure {
  // APIConnectionError (and its timeout subclass) extends APIError, so it goes first.
  if (err instanceof Anthropic.APIConnectionError) return unknownBilling;
  if (!(err instanceof Anthropic.APIError)) return unknownBilling;

  const status = typeof err.status === "number" ? err.status : null;
  const body = err.error as { error?: { type?: unknown } } | undefined;
  const type = (err as { type?: unknown }).type ?? body?.error?.type;
  if (status === 402 || type === "billing_error") return { kind: "billing" };
  if (status === null) return unknownBilling; // e.g. an abort: no answer was read
  if (status === 401 || status === 403 || status === 404) return { kind: "misconfigured" };
  if (status === 408 || status === 409 || status === 429 || status >= 500) {
    return { kind: "retry", retryAfterSeconds: retryAfterSeconds(err.headers), billedUnknown: false };
  }
  if (status >= 400) return { kind: "rejected" };
  return unknownBilling;
}

const BACKOFF_BASE_S = 30;
const BACKOFF_CAP_S = 600;

/** max(retry-after, 30 s x 2^(attempts-1)), capped at 10 minutes. */
export function backoffAt(now: Date, attempts: number, retryAfterSeconds: number | null): Date {
  const exp = BACKOFF_BASE_S * 2 ** Math.max(0, attempts - 1);
  const seconds = Math.min(BACKOFF_CAP_S, Math.max(retryAfterSeconds ?? 0, exp));
  return new Date(now.getTime() + seconds * 1000);
}

/** No household or book text can close its tag. */
export function escapeData(s: string): string {
  return s.replaceAll("<", "‹");
}

/** Cuts to max UTF-16 code units without leaving half a surrogate pair. */
export function clip(s: string, max: number): string {
  if (s.length <= max) return s;
  const out = s.slice(0, max);
  return /[\uD800-\uDBFF]$/.test(out) ? out.slice(0, -1) : out;
}

/**
 * Sonnet thinks adaptively. Haiku 5.5 thinks adaptively by default and its
 * thinking shares max_tokens, so it is disabled, which the API accepts at
 * effort high or below.
 */
export function thinkingFor(
  model: AiModel,
  effort: "low" | "medium",
): { thinking: { type: "adaptive" } | { type: "disabled" }; output_config: { effort: string } } {
  return {
    thinking: model === "claude-haiku-5-5" ? { type: "disabled" } : { type: "adaptive" },
    output_config: { effort },
  };
}

const LOCAL_HOSTS = new Set(["kong", "127.0.0.1", "localhost"]);

/**
 * The fake runs only when its flag is "1" and SUPABASE_URL's host is local
 * (D8, as Plan 5's chooseScreener), so a flag left set can't reach production.
 */
export function fakeAllowed(getEnv: (name: string) => string | undefined, flag: string): boolean {
  if (getEnv(flag) !== "1") return false;
  try {
    return LOCAL_HOSTS.has(new URL(getEnv("SUPABASE_URL") ?? "").hostname);
  } catch {
    return false;
  }
}
