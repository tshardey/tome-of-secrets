import assert from "node:assert/strict";
import { SERIES_AUDIT_BOOKS } from "./series-audit-synthetic.ts";

const COUNTS: Record<string, number> = {
  correct: 1,
  spelling: 1,
  "wrong-series": 1,
  standalone: 1,
  "wrong-number": 1,
  cluster: 3,
  unknown: 1,
  "missing-named": 1,
  "missing-unnamed": 1,
};

const EXPECTED: Record<string, { flag: string; name?: string | null; volume?: number | null }> = {
  correct: { flag: "none" },
  spelling: { flag: "none" },
  "wrong-series": { flag: "wrong_series", name: "Saltglass Archive", volume: 1 },
  standalone: { flag: "wrong_series", name: null },
  "wrong-number": { flag: "wrong_number", volume: 4 },
  unknown: { flag: "none" },
  "missing-named": { flag: "wrong_number", volume: 3 },
  "missing-unnamed": { flag: "none" },
};

/** ISBN-13 check digit the standard way. */
function checkDigit(first12: string): number {
  const sum = [...first12].reduce((s, d, i) => s + Number(d) * (i % 2 === 0 ? 1 : 3), 0);
  return (10 - (sum % 10)) % 10;
}

Deno.test("series audit fixture: every case is present with the expected flag", () => {
  assert.equal(SERIES_AUDIT_BOOKS.length, 11);
  SERIES_AUDIT_BOOKS.forEach((b, i) => assert.equal(b.ref, i + 1));
  for (const [kind, n] of Object.entries(COUNTS)) {
    assert.equal(SERIES_AUDIT_BOOKS.filter((b) => b.kind === kind).length, n, kind);
  }
  for (const b of SERIES_AUDIT_BOOKS) {
    if (b.kind === "cluster") assert.equal(b.expected.flag, "wrong_series", b.title);
    else assert.equal(b.expected.flag, EXPECTED[b.kind].flag, b.title);
    if (b.kind === "cluster") assert.equal(b.expected.name ?? null, null, b.title);
    else {
      for (const key of ["name", "volume"] as const) {
        if (key in EXPECTED[b.kind]) assert.equal(b.expected[key], EXPECTED[b.kind][key], `${b.title} ${key}`);
      }
    }
  }
});

Deno.test("series audit fixture: recorded series, neighbours and evidence match the table", () => {
  const by = (kind: string) => SERIES_AUDIT_BOOKS.filter((b) => b.kind === kind);
  assert.deepEqual(by("correct")[0].recorded, { name: "Thornmere Cycle", volume: 2 });
  assert.ok(by("correct")[0].neighbours.some((n) => n.handSet && n.seriesVolume === 1));
  assert.deepEqual(by("spelling")[0].recorded, { name: "Thornmere cycle", volume: 3 });
  assert.ok(by("spelling")[0].description.includes("The Thornmere Cycle, book three"));
  assert.deepEqual(by("wrong-series")[0].recorded, { name: "Lantern Vale Cycle", volume: 1 });
  assert.deepEqual(by("standalone")[0].recorded, { name: "Wrenfold Tales", volume: 4 });
  assert.ok(by("standalone")[0].description.includes("a standalone novel"));
  assert.deepEqual(by("wrong-number")[0].recorded, { name: "Ember Loom", volume: 2 });
  assert.equal(by("unknown")[0].description.length, 40);
  assert.deepEqual(by("unknown")[0].neighbours, []);
  assert.deepEqual(by("unknown")[0].recorded, { name: "Wrenfold Tales", volume: 2 });
  assert.deepEqual(by("missing-named")[0].recorded, { name: "Saltglass Archive", volume: null });
  assert.deepEqual(by("missing-unnamed")[0].recorded, { name: "Saltglass Archive", volume: null });
  assert.equal(by("missing-unnamed")[0].expected.flag, "none");
});

Deno.test("series audit fixture: the cluster is three Ember Loom books that vouch for none", () => {
  const cluster = SERIES_AUDIT_BOOKS.filter((b) => b.kind === "cluster");
  assert.deepEqual(cluster.map((b) => b.recorded.volume), [1, 2, 3]);
  for (const b of cluster) {
    assert.equal(b.recorded.name, "Ember Loom");
    assert.deepEqual(b.authors, ["Corin Vasselby"]);
    assert.equal(b.neighbours.length, 2);
    assert.ok(b.neighbours.every((n) => !n.handSet && n.seriesName === "Ember Loom"), b.title);
    assert.ok(b.description.includes("standalone"));
  }
});

Deno.test("series audit fixture: invented ISBNs are 13 digits with a wrong check digit", () => {
  for (const b of SERIES_AUDIT_BOOKS) {
    if (b.isbn === null) continue;
    assert.match(b.isbn, /^\d{13}$/);
    assert.notEqual(Number(b.isbn[12]), checkDigit(b.isbn.slice(0, 12)), b.isbn);
  }
  assert.ok(SERIES_AUDIT_BOOKS.some((b) => b.isbn !== null));
});

Deno.test("series audit fixture: only invented names are used", () => {
  const SERIES = ["Thornmere Cycle", "Thornmere cycle", "Saltglass Archive", "Wrenfold Tales", "Ember Loom", "Lantern Vale Cycle"];
  const AUTHORS = ["Ines Dravenholt", "Petra Wynnecombe", "A. Reed", "M. Holt", "Corin Vasselby"];
  for (const b of SERIES_AUDIT_BOOKS) {
    assert.ok(SERIES.includes(b.recorded.name), b.recorded.name);
    for (const a of b.authors) assert.ok(AUTHORS.includes(a), a);
    for (const n of b.neighbours) if (n.seriesName) assert.ok(SERIES.includes(n.seriesName), n.seriesName);
  }
});
