# 4YQQ Art Brief — Beyond the Library Doors

Fifteen images: **ten side quest cards** and **five item illustrations**.

Companion to [`2026-08-30-4yqq-side-quest-expansion-draft3.md`](2026-08-30-4yqq-side-quest-expansion-draft3.md).
This is a **maintainer task** — art lives in Supabase, not in the repo (`git ls-files assets/images`
returns nothing). The JSON can ship ahead of the art; cards render with their text overlay over a
broken image, which is ugly but not broken.

---

## Naming is derived, not chosen

Filenames are **computed from the quest name and the item id** by `assets/js/utils/questCardImage.js`
and the `img` field in `allItems.json`. Getting a name wrong means a silently missing image, so use
the tables below verbatim.

**Side quest cards** — `getQuestImageFilename()` lowercases, **keeps** the leading "The", strips
every character outside `[a-z0-9\s-]` (apostrophes vanish, they are not replaced), collapses
whitespace to single hyphens, and appends `.png`:

```
"Haggler's Row"     → hagglers-row.png
"The Blind Stall"   → the-blind-stall.png
```

Path: `assets/images/side-quests/<filename>`

**Item illustrations** — the path is written literally into each item's `img` field, following
`assets/images/rewards/<kebab-id>.png`.

**Uploading to Supabase:** the CDN helper strips the `assets/` prefix, so a file the code requests as
`assets/images/side-quests/hagglers-row.png` must exist in the bucket at
`images/side-quests/hagglers-row.png`. Item art goes to `images/rewards/<id>.png`.

---

## Technical specification

| | Side quest cards | Item illustrations |
|---|---|---|
| Aspect ratio | **2:3 portrait** (`.quest-card`) | **1:1 square** |
| Delivery size | **800 × 1200 px** | **512 × 512 px** |
| Format | PNG | PNG, **transparent background** |
| Fit | `object-fit: cover` — the frame crops, so keep nothing critical near the edges | `object-fit: contain` — never cropped, but rendered as small as 32 × 32 |
| Rendered at | 300 px wide in the deck | up to 250 px tall on the Rewards page; 32 px in reward chips |

### The composition constraint that matters most

Side quest cards carry a **bottom-anchored text overlay** (`.card-content`) — a gradient from
`rgba(42, 35, 29, 0.95)` at the bottom to transparent at the top, holding the quest title,
description, and prompt.

The ten new quests **branch**, so their overlay carries more than the existing eight: a roll
instruction, a dropdown, the branch prompt, and on *The Visiting Scholar* a text input as well.
Expect the overlay to occupy the **bottom 55–70%** of the card.

> **Compose every subject in the top third of the frame.** Anything below the halfway line will be
> sitting behind a near-opaque panel.

### Palette

Match the existing Dark Academia cards:

| Role | Hex |
|---|---|
| Ground / darkest | `#2a231d` |
| Antique gold (titles, rules) | `#b89f62` |
| Parchment (body text) | `#d4c8b0` |
| Muted frame | `#54483b` |

Item art reads against `#2a231d` with a `#54483b` border, so keep the background transparent and
avoid near-black subjects that disappear into the card.

### House style

Painterly, warm, candle-lit; the register of an illustrated field guide or a tarot minor arcana
rather than a game icon. The existing eight side quest cards are the reference — pull two or three
down from Supabase before starting. **No lettering inside the artwork**: every card's title is drawn
by the overlay, and baked-in text will collide with it.

---

## The ten side quest cards

All four locales sit **outside** the Grand Library. Nine of the ten existing cards are interiors —
that contrast is the point of the expansion, so favour open air, weather, and distance.

### Locale I · The Ninefold Bazaar
> A market that assembles at the library gates on no announced schedule and is gone by the third
> morning. Nine rows of stalls. Nothing here is sold at the asking price, and nothing here is sold new.

| # | File | Quest | Subject |
|---|---|---|---|
| 1 | `hagglers-row.png` | Haggler's Row | A narrow lane of trestle stalls at dusk, books stacked in leaning towers, lanterns strung overhead on a sagging line. A stallkeeper's hand extended mid-bargain in the upper third. Crowded, warm, mercantile — the feeling of being recognised and quoted a lower price. |
| 2 | `the-blind-stall.png` | The Blind Stall | The last stall of the ninth row, half in shadow. Books wrapped in butcher's paper and tied with string, stacked in a pyramid — every one anonymous. The merchant is a silhouette behind them; her face is never shown. One parcel offered forward, catching the light. |

### Locale II · The Festival of Turning
> The town holds it whenever something turns — a harvest, a treaty, a birth, the end of a long rain.
> There is no season attached to it and asking which turning is being marked is considered rude.

| # | File | Quest | Subject |
|---|---|---|---|
| 3 | `the-masked-procession.png` | The Masked Procession | A night street, a procession of masked figures carrying lanterns, seen from slightly above. Masks are animal and abstract, not sinister — celebratory. One mask in the foreground upper third is held out toward the viewer, waiting to be taken. Deliberately season-agnostic: no snow, no autumn leaves, no blossom. |
| 4 | `the-communal-table.png` | The Communal Table | One enormously long table running the full depth of a town square, vanishing toward the horizon. Mismatched chairs, shared plates, books set down open beside the food. Warm lamplight. Nobody eats alone — the table should read as impossible to sit at by yourself. |

### Locale III · The Exchange
> A term abroad at an institution that keeps no library at all — only teachers, fields, and workshops.
> They find your Sanctum charming and slightly pitiable.

| # | File | Quest | Subject |
|---|---|---|---|
| 5 | `the-visiting-scholar.png` | The Visiting Scholar | A lecture hall or courtyard in an unfamiliar architectural idiom — deliberately *not* the Library's gothic. A single figure with a travelling case standing at the threshold, small against the space. The feeling of arriving somewhere your expertise counts for nothing. |
| 6 | `the-field-practicum.png` | The Field Practicum | Open ground, not a room: a workshop bench under a canopy, or a terraced field with tools. Hands doing something — kneading, planting, measuring — with a closed book set aside on a stone. Reading is the prerequisite here, not the work. |

### Locale IV · The Open Road
> Everything between one door and the next. The road doesn't care what you meant to read; it cares
> what you happen to have on you when the ferry leaves.

| # | File | Quest | Subject |
|---|---|---|---|
| 7 | `the-crossroads-inn.png` | The Crossroads Inn | An inn at the meeting of four roads, seen from outside at night, windows lit. A signpost with four arms in the upper third. Interior glimpsed through a window: a hearth, a bar, someone already being handed something they did not order. |
| 8 | `the-short-crossing.png` | The Short Crossing | A small ferry mid-channel, near bank and far bank both visible — the crossing is manifestly short. A passenger on the rail with a slim volume; the ferryman's silhouette at the tiller, visibly judging. Water, grey light, wind. |
| 9 | `the-lending-cart.png` | The Lending Cart | A handcart heaped with secondhand books on a country road, canvas half-thrown back. Every copy visibly used — broken spines, protruding slips of paper, a library stamp. The carter's face is turned away or shadowed; he does not say where he got any of it. |
| 10 | `the-relay-house.png` | The Relay House | A staging post at the edge of a road: pigeonholes stuffed with letters, a sorting counter, saddlebags waiting by the door. A horse or rider suggested outside through a window. Paper everywhere, all of it addressed to somebody. |

---

## The five item illustrations

Object portraits — a single item, centred, on transparent background, lit as if on a dark shelf.
Match the existing reward art in `images/rewards/`.

| # | File | Item | Type | Subject |
|---|---|---|---|---|
| 11 | `hagglers-ledger.png` | The Haggler's Ledger | Non-Wearable | A slim market ledger, soft leather covers curled from handling, a pencil stub tucked in the spine and a bookmark ribbon. Columns of figures visible on a half-open page — struck through and rewritten lower. Grants **Dusty Blueprints**, so work brass, paper and drafting tones rather than arcane glow. |
| 12 | `revelers-mask.png` | The Reveler's Mask | Wearable | A festival half-mask on its ribbons — papier-mâché or thin painted wood, gilded at the brow, a little worn at the edges. Ambiguous features: not an animal, not quite a face. Should read as something you'd be handed at a gate, not a ceremonial artefact. |
| 13 | `visiting-scholars-sigil.png` | Visiting Scholar's Sigil | Wearable | An enamelled enrolment pin or seal on a short chain — an academic device from an institution that is plainly not yours. Foreign lettering suggested but **unreadable**; the point is that you cannot pronounce it. Small, official, slightly bureaucratic. |
| 14 | `crossroads-fox.png` | The Crossroads Fox | Familiar | A fox sitting at a signpost's base, alert, head tilted, one paw raised as if about to set off down a road it has already chosen. The only Familiar in the game with an activated ability — it should look like it is *about to do something*, not like a sleeping companion. |
| 15 | `menders-thread.png` | The Mender's Thread | Non-Wearable | A bookbinder's needle and waxed linen thread on a spool, beside a damaged text block with visible stitching along the spine. Repair in progress. Grants **Dusty Blueprints** — pair it visually with the Ledger: brass, linen, workbench light. |

---

## Checklist before upload

- [ ] Filename matches the table **character for character** (apostrophes removed, not replaced; "The" kept on quest cards).
- [ ] Quest cards are 2:3, subject in the top third, no baked-in lettering.
- [ ] Item art is square with a transparent background and still legible at 32 px.
- [ ] Uploaded to the bucket at `images/side-quests/…` or `images/rewards/…` (**no** `assets/` prefix).
- [ ] `images_cdn_base` is set in `_config.yml` (currently `""`) or the site will look for these in the repo, where they do not exist.

## Optional, not required

Locale artwork (four images, one per locale) would let the rules pages and the side quests drawer
band by locale the way the design document does. Nothing in the code requests such a file today, so
this is a nice-to-have and needs a code change to consume. Skip it for this release.
