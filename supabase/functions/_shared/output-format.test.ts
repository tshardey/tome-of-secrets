import assert from "node:assert/strict";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { z } from "zod";
import { outputFormat } from "./output-format.ts";

Deno.test("outputFormat: the SDK's own schema moves an enum into the description (the cause)", () => {
  const sdk = zodOutputFormat(z.object({ pick: z.enum(["a", "b"]) })).schema as {
    properties: Record<string, Record<string, unknown>>;
  };
  assert.equal(sdk.properties.pick.enum, undefined);
  assert.ok(String(sdk.properties.pick.description).includes("{enum"));
});

Deno.test("outputFormat restores nested enums, keeps a description of its own, and changes nothing else", () => {
  const schema = z.object({
    list: z.array(z.object({ pick: z.enum(["a", "b"]).describe("Choose one.") })),
    maybe: z.enum(["x", "y"]).nullable(),
    name: z.string(),
  });
  const f = outputFormat(schema);
  const s = f.schema as { properties: Record<string, Record<string, unknown>> };
  const item = (s.properties.list.items as { properties: Record<string, unknown> }).properties.pick;
  assert.deepEqual(item, { type: "string", enum: ["a", "b"], description: "Choose one." });
  assert.deepEqual((s.properties.maybe.anyOf as unknown[])[0], { type: "string", enum: ["x", "y"] });
  assert.deepEqual(s.properties.name, { type: "string" });
  // Without enums, the schema is exactly the SDK's.
  const plain = z.object({ a: z.string(), b: z.array(z.number()) });
  assert.deepEqual(outputFormat(plain).schema, zodOutputFormat(plain).schema);
  assert.equal(f.zod, schema);
  // An enum used twice is hoisted into $defs; it is restored there.
  const shared = z.enum(["a", "b"]);
  const reused = outputFormat(z.object({ one: shared, two: shared })).schema as { $defs?: Record<string, unknown> };
  assert.ok(reused.$defs);
  assert.deepEqual(Object.values(reused.$defs), [{ type: "string", enum: ["a", "b"] }]);
  // Nothing of an enum is left in a description anywhere.
  for (const sent of [f.schema, reused]) assert.ok(!JSON.stringify(sent).includes("{enum"));
});

Deno.test("outputFormat.parse is the SDK's: JSON, then the zod schema, throwing on either", () => {
  const f = outputFormat(z.object({ pick: z.enum(["a", "b"]) }));
  assert.deepEqual(f.parse('{"pick":"a"}'), { pick: "a" });
  assert.throws(() => f.parse('{"pick":"c"}'));
  assert.throws(() => f.parse("not json"));
});
