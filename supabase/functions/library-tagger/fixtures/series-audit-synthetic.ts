// Synthetic books for the Plan 12 series audit checks. Every title, author,
// description, series and ISBN here is INVENTED. This file is in a public
// repository: do not add real titles, authors, series, ISBNs or descriptions.
// Invented ISBNs are 13 digits with a deliberately wrong check digit.
//
// No images are stored. `recorded` is the series and number the household has
// on file; `neighbours` are the household's other books by the same author, as
// the audit's evidence block lists them; `openLibrary` is what the Open Library
// lookup would return. `expected` is the flag a good run leaves: none, a
// wrong_series card (name and volume, both null for a standalone) or a
// wrong_number card (the right volume).

import type { AuditNeighbour } from "../audit.ts";

export type SeriesAuditKind =
  | "correct"
  | "spelling"
  | "wrong-series"
  | "standalone"
  | "wrong-number"
  | "cluster"
  | "unknown"
  | "missing-named"
  | "missing-unnamed";

export interface SeriesAuditBook {
  /** 1-based position. */
  ref: number;
  title: string;
  authors: string[];
  description: string;
  recorded: { name: string; volume: number | null };
  neighbours: AuditNeighbour[];
  openLibrary: string[];
  isbn: string | null;
  kind: SeriesAuditKind;
  expected: { flag: "none" | "wrong_series" | "wrong_number"; name?: string | null; volume?: number | null };
}

const emberNeighbour = (title: string, volume: number): AuditNeighbour => ({
  title,
  seriesName: "Ember Loom",
  seriesVolume: volume,
  handSet: false,
});

export const SERIES_AUDIT_BOOKS: SeriesAuditBook[] = [
  {
    ref: 1,
    title: "The Thornmere Hollow",
    authors: ["Ines Dravenholt"],
    description: "The second Thornmere Cycle book. The hollow keeper learns what the first winter left buried.",
    recorded: { name: "Thornmere Cycle", volume: 2 },
    neighbours: [{ title: "The Thornmere Gate", seriesName: "Thornmere Cycle", seriesVolume: 1, handSet: true }],
    openLibrary: [],
    isbn: "9780000002010",
    kind: "correct",
    expected: { flag: "none" },
  },
  {
    ref: 2,
    title: "The Thornmere Bell",
    authors: ["Ines Dravenholt"],
    description: "The Thornmere Cycle, book three. The bell-ringer is called back to the marsh village.",
    recorded: { name: "Thornmere cycle", volume: 3 },
    neighbours: [],
    openLibrary: [],
    isbn: null,
    kind: "spelling",
    expected: { flag: "none" },
  },
  {
    ref: 3,
    title: "Glass for the Archivist",
    authors: ["Petra Wynnecombe"],
    description: "The first Saltglass Archive book. An archivist catalogues a library built from melted shorelines.",
    recorded: { name: "Lantern Vale Cycle", volume: 1 },
    neighbours: [],
    openLibrary: [],
    isbn: "9780000002034",
    kind: "wrong-series",
    expected: { flag: "wrong_series", name: "Saltglass Archive", volume: 1 },
  },
  {
    ref: 4,
    title: "A Hundred Wrenfold Mornings",
    authors: ["A. Reed"],
    description: "This is a standalone novel about a ferry clerk who keeps a diary of one town's mornings.",
    recorded: { name: "Wrenfold Tales", volume: 4 },
    neighbours: [],
    openLibrary: [],
    isbn: null,
    kind: "standalone",
    expected: { flag: "wrong_series", name: null },
  },
  {
    ref: 5,
    title: "The Loom at Low Tide",
    authors: ["M. Holt"],
    description: "The fourth Ember Loom novel. The weavers return to the harbour house to finish the pattern.",
    recorded: { name: "Ember Loom", volume: 2 },
    neighbours: [],
    openLibrary: [],
    isbn: "9780000002058",
    kind: "wrong-number",
    expected: { flag: "wrong_number", volume: 4 },
  },
  {
    ref: 6,
    title: "Ash Under the Eaves",
    authors: ["Corin Vasselby"],
    description: "A standalone novel set in a mill town where the lamps burn red. It shares only its setting with the author's other books.",
    recorded: { name: "Ember Loom", volume: 1 },
    neighbours: [emberNeighbour("Cinders at Candlemas", 2), emberNeighbour("The Last Red Lamp", 3)],
    openLibrary: [],
    isbn: null,
    kind: "cluster",
    expected: { flag: "wrong_series", name: null },
  },
  {
    ref: 7,
    title: "Cinders at Candlemas",
    authors: ["Corin Vasselby"],
    description: "A standalone novel about a lamplighter's strike, in the same red-lamp mill town as the author's other books.",
    recorded: { name: "Ember Loom", volume: 2 },
    neighbours: [emberNeighbour("Ash Under the Eaves", 1), emberNeighbour("The Last Red Lamp", 3)],
    openLibrary: [],
    isbn: null,
    kind: "cluster",
    expected: { flag: "wrong_series", name: null },
  },
  {
    ref: 8,
    title: "The Last Red Lamp",
    authors: ["Corin Vasselby"],
    description: "A standalone novel of a mill town's final night shift. It shares a setting with the author's other books and nothing else.",
    recorded: { name: "Ember Loom", volume: 3 },
    neighbours: [emberNeighbour("Ash Under the Eaves", 1), emberNeighbour("Cinders at Candlemas", 2)],
    openLibrary: [],
    isbn: "9780000002089",
    kind: "cluster",
    expected: { flag: "wrong_series", name: null },
  },
  {
    ref: 9,
    title: "Quiet Ferry",
    authors: ["A. Reed"],
    description: "A quiet book about a ferry and its crew.",
    recorded: { name: "Wrenfold Tales", volume: 2 },
    neighbours: [],
    openLibrary: [],
    isbn: null,
    kind: "unknown",
    expected: { flag: "none" },
  },
  {
    ref: 10,
    title: "The Third Salt Ledger",
    authors: ["Petra Wynnecombe"],
    description: "Book three of the Saltglass Archive. The archivist follows a ledger out to the glass flats.",
    recorded: { name: "Saltglass Archive", volume: null },
    neighbours: [],
    openLibrary: [],
    isbn: "9780000002102",
    kind: "missing-named",
    expected: { flag: "wrong_number", volume: 3 },
  },
  {
    ref: 11,
    title: "A Ledger of Sand",
    authors: ["Petra Wynnecombe"],
    description: "A Saltglass Archive novel. The archivist is sent to catalogue a drowned reading room.",
    recorded: { name: "Saltglass Archive", volume: null },
    neighbours: [],
    openLibrary: [],
    isbn: null,
    kind: "missing-unnamed",
    expected: { flag: "none" },
  },
];
