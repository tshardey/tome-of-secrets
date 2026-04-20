# Bead gbx: Extract character-sheet.md Tab Panels — Design Spec

**Bead:** `tome-of-secrets-gbx`
**Goal:** Extract the 10 tab panel HTML blocks and the tab navigation bar from `character-sheet.md` into Jekyll `_includes/` files, reducing the main file from ~1,076 lines to ~30 lines while producing byte-identical rendered output.

**Architecture:** Same pattern as bead 324 (drawer extraction) — pure Jekyll `{% include %}` extraction. Each tab panel's markup moves to its own `.html` file under `_includes/character-sheet/tabs/`. No JS, CSS, or behavioral changes. The rendered HTML is identical before and after.

**Tech Stack:** Jekyll 3.10 (github-pages gem), Liquid templating, Jest for JS tests

---

## Files to Create

All files created under `_includes/character-sheet/tabs/`:

| File | Source (character-sheet.md) | Approx Lines |
|------|-----------------------------|-------------|
| `tab-nav.html` | Lines 10–42 — `<nav class="tab-nav">` through closing `</nav>` | 33 |
| `character.html` | Lines 45–178 — `<div class="tab-panel" data-tab-panel="character">` block | 133 |
| `abilities.html` | Lines 181–266 — `<div class="tab-panel" data-tab-panel="abilities">` block | 85 |
| `inventory.html` | Lines 269–354 — `<div class="tab-panel" data-tab-panel="inventory">` block | 85 |
| `environment.html` | Lines 357–444 — `<div class="tab-panel" data-tab-panel="environment">` block | 87 |
| `library.html` | Lines 447–544 — `<div class="tab-panel" data-tab-panel="library">` block | 97 |
| `campaigns.html` | Lines 547–612 — `<div class="tab-panel" data-tab-panel="campaigns">` block | 65 |
| `quests.html` | Lines 615–865 — `<div class="tab-panel" data-tab-panel="quests">` block | 250 |
| `external-curriculum.html` | Lines 868–912 — `<div class="tab-panel" data-tab-panel="external-curriculum">` block | 44 |
| `archived.html` | Lines 915–978 — `<div class="tab-panel" data-tab-panel="archived">` block | 63 |
| `curses.html` | Lines 981–1048 — `<div class="tab-panel" data-tab-panel="curses">` block | 67 |

## Files to Modify

- `character-sheet.md` — Replace all extracted blocks with `{% include character-sheet/tabs/<name>.html %}` tags

## Resulting character-sheet.md Structure

After extraction, `character-sheet.md` will contain only:

```markdown
---
layout: default
title: Keeper's Character Sheet
permalink: /character-sheet.html
---

<form id="character-sheet">

<!-- Tab Navigation -->
<div class="tab-container">
    {% include character-sheet/tabs/tab-nav.html %}

{% include character-sheet/tabs/character.html %}
{% include character-sheet/tabs/abilities.html %}
{% include character-sheet/tabs/inventory.html %}
{% include character-sheet/tabs/environment.html %}
{% include character-sheet/tabs/library.html %}
{% include character-sheet/tabs/campaigns.html %}
{% include character-sheet/tabs/quests.html %}
{% include character-sheet/tabs/external-curriculum.html %}
{% include character-sheet/tabs/archived.html %}
{% include character-sheet/tabs/curses.html %}

</div>
<!-- END TAB CONTAINER -->

{% include character-sheet/drawers/table-overlay.html %}
...drawer includes...
{% include character-sheet/drawers/quest-edit.html %}

    <div class="form-buttons">
    ...save indicator...
    </div>
</form>
```

## Liquid Template Tags

Several tabs contain Liquid template references (`{{ site.baseurl }}`) that work correctly inside include files (proven by bead 324's dungeons drawer extraction):

- `character.html` — links to Shopping page
- `inventory.html` — links to Library Restoration page

## Approach

One-shot extraction: build baseline, extract all 11 files, replace all blocks, verify with a single diff.

## Verification

1. `bundle exec jekyll build` succeeds with no warnings
2. `diff` of rendered `character-sheet.html` against baseline shows no differences (byte-identical)
3. Full Jest test suite passes (all 1,511+ tests)
4. `character-sheet.md` reduced to ~30 lines
5. All 11 include files exist under `_includes/character-sheet/tabs/`

## Out of Scope

- No JavaScript changes
- No CSS changes
- No behavioral changes
- No further decomposition of large tabs (quests at 250 lines stays as one file)
- No layout reorganization (future work tracked separately)
