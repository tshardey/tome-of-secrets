import assert from "node:assert/strict";
import { SERIES_ACCURACY_BOOKS } from "./series-accuracy-synthetic.ts";

const KINDS = ["author-two-ways", "cross-author", "number-in-title", "thematic-set", "ol-hint", "unknown", "injection"] as const;

Deno.test("series accuracy fixture: 12 books, every kind, traps never expect a series", () => {
  assert.equal(SERIES_ACCURACY_BOOKS.length, 12);
  SERIES_ACCURACY_BOOKS.forEach((b, i) => assert.equal(b.ref, i + 1));
  for (const kind of KINDS) assert.ok(SERIES_ACCURACY_BOOKS.some((b) => b.kind === kind), kind);
  for (const b of SERIES_ACCURACY_BOOKS.filter((b) => ["number-in-title", "thematic-set", "unknown", "injection"].includes(b.kind))) {
    assert.ok(b.expected.status === "none" || b.expected.status === "unsure", b.title);
    assert.equal(b.expected.name, null, b.title);
  }
  for (const b of SERIES_ACCURACY_BOOKS.filter((b) => b.kind === "cross-author")) {
    assert.notEqual(b.expected.name, "Lantern Vale Cycle", b.title);
    assert.ok(b.expected.status !== "found", b.title);
  }
  for (const b of SERIES_ACCURACY_BOOKS.filter((b) => ["author-two-ways", "ol-hint"].includes(b.kind))) {
    assert.equal(b.expected.status, "found", b.title);
  }
  assert.equal(SERIES_ACCURACY_BOOKS.filter((b) => b.kind === "unknown").every((b) => b.description.length === 40), true);
  for (const b of SERIES_ACCURACY_BOOKS) {
    if (b.isbn !== null) assert.match(b.isbn, /^\d{13}$/);
  }
});
