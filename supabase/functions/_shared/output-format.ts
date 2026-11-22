// The reply format every library function sends as output_config.format.
// Use outputFormat, never the SDK's zodOutputFormat directly: see restoreEnums.
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { z } from "zod";

type Json = Record<string, unknown>;
const isObject = (v: unknown): v is Json => typeof v === "object" && v !== null && !Array.isArray(v);

/**
 * The SDK's transformJSONSchema (1.3.0) keeps only `format` on a string and
 * moves every other keyword into the description, `enum` included, though
 * structured outputs support enum. So series_status went to the API as any
 * string (2026-11-22). This puts each enum of zod's own JSON schema back on the
 * matching node and takes the "{enum: [...]}" the SDK wrote off its description.
 * A z.literal's `const` is moved the same way and is not restored: no schema
 * here uses one.
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

/**
 * A reply format: the JSON schema sent as output_config.format, the zod schema
 * the reply is checked against, and the SDK's parse (JSON.parse, then that zod
 * schema; it throws on either failing).
 */
export interface OutputFormat<T> {
  schema: Json;
  zod: z.ZodType<T>;
  parse(content: string): T;
}

/** zodOutputFormat's schema with its enums restored (see restoreEnums). */
export function outputFormat<T>(schema: z.ZodType<T>): OutputFormat<T> {
  const sdk = zodOutputFormat(schema);
  const sent = sdk.schema as Json;
  restoreEnums(sent, z.toJSONSchema(schema, { reused: "ref" }));
  return { schema: sent, zod: schema, parse: (content) => sdk.parse(content) as T };
}
