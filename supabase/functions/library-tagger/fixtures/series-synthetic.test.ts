import assert from "node:assert/strict";
import { SERIES_BOOKS } from "./series-synthetic.ts";

Deno.test("series fixture: 12 books, every kind, no expected series for the traps", () => {
  assert.equal(SERIES_BOOKS.length, 12);
  SERIES_BOOKS.forEach((b, i) => assert.equal(b.ref, i + 1));
  for (
    const kind of ["clear", "household-spelling", "novella", "omnibus", "standalone", "uncertain", "injection"] as const
  ) {
    assert.ok(SERIES_BOOKS.some((b) => b.kind === kind), kind);
  }
  for (const b of SERIES_BOOKS.filter((b) => ["standalone", "uncertain", "injection"].includes(b.kind))) {
    assert.equal(b.expected, null, b.title);
  }
  assert.equal(SERIES_BOOKS.filter((b) => b.kind === "clear").length, 3);
  assert.equal(SERIES_BOOKS.filter((b) => b.kind === "household-spelling").length, 2);
  assert.equal(SERIES_BOOKS.filter((b) => b.kind === "standalone").length, 3);
  const omnibus = SERIES_BOOKS.find((b) => b.kind === "omnibus")!;
  assert.deepEqual(omnibus.expected, { name: "Saltglass Archive", volume: null });
  assert.equal(SERIES_BOOKS.find((b) => b.kind === "novella")!.expected!.volume, 2.5);
});
