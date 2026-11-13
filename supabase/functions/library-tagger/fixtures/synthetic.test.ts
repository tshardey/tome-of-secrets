import assert from "node:assert/strict";
import { SYNTHETIC_BOOKS, SYNTHETIC_PROMPTS } from "./synthetic.ts";

Deno.test("synthetic fixture: the agreed mix", () => {
  assert.equal(SYNTHETIC_BOOKS.length, 20);
  assert.equal(SYNTHETIC_PROMPTS.length, 10);
  SYNTHETIC_BOOKS.forEach((b, i) => assert.equal(b.ref, i + 1));
  assert.equal(SYNTHETIC_BOOKS.filter((b) => b.expected.trap === "edition").length, 4);
  assert.equal(SYNTHETIC_BOOKS.filter((b) => b.expected.trap === "injection").length, 2);
  assert.equal(SYNTHETIC_BOOKS.filter((b) => !b.hasCover).length, 2);
  assert.equal(SYNTHETIC_BOOKS.filter((b) => b.coverSpec !== null).length, 4);
  assert.equal(SYNTHETIC_BOOKS.filter((b) => !b.expected.trap && b.hasCover && !b.coverSpec).length, 8);
  // edition traps expect no content tags and never special-edition
  for (const b of SYNTHETIC_BOOKS) assert.ok(!b.expected.tos.includes("special-edition"));
  for (const b of SYNTHETIC_BOOKS.filter((b) => b.expected.trap === "edition")) {
    assert.deepEqual(b.expected.tos, []);
  }
  // cover tags only on books with a generated cover
  for (const b of SYNTHETIC_BOOKS) {
    if (!b.coverSpec) assert.ok(!b.expected.library.some((t) => t.startsWith("cover-")), b.title);
  }
});

Deno.test("synthetic fixture: expected refs fit the books", () => {
  const by = (ref: number) => SYNTHETIC_BOOKS[ref - 1];
  for (const p of SYNTHETIC_PROMPTS) {
    for (const r of p.expectedRefs) assert.ok(r >= 1 && r <= 20, p.prompt);
    assert.equal(p.answerable, p.expectedRefs.length > 0);
  }
  const refs = (prompt: string) => SYNTHETIC_PROMPTS.find((p) => p.prompt.includes(prompt))!.expectedRefs;
  assert.ok(refs("starts with B").every((r) => by(r).title.startsWith("B")));
  assert.deepEqual(refs("R-E-A-D").map((r) => by(r).title[0]), ["R", "E", "A", "D"]);
  assert.ok(refs("under 200").every((r) => by(r).pageCount < 200));
  assert.ok(refs("before 1950").every((r) => Number(by(r).publishYear) < 1950));
  // every book that fits those three is listed
  assert.deepEqual(
    SYNTHETIC_BOOKS.filter((b) => b.pageCount < 200).map((b) => b.ref),
    refs("under 200"),
  );
  assert.deepEqual(
    SYNTHETIC_BOOKS.filter((b) => Number(b.publishYear) < 1950).map((b) => b.ref),
    refs("before 1950"),
  );
  assert.deepEqual(
    SYNTHETIC_BOOKS.filter((b) => b.title.startsWith("B")).map((b) => b.ref),
    refs("starts with B"),
  );
  assert.ok(by(refs("antler")[0]).title.includes("Antler"));
  assert.equal(by(refs("red cover")[0]).coverSpec?.background, "red");
  assert.ok(refs("vampires").every((r) => by(r).expected.library.includes("vampires")));
  assert.ok(refs("Found family").every((r) => by(r).expected.library.includes("found-family")));
  assert.ok(SYNTHETIC_BOOKS.filter((b) => b.expected.library.includes("found-family")).length === refs("Found family").length);
});
