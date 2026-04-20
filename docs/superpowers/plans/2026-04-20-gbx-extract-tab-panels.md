# Bead gbx: Extract character-sheet.md Tab Panels — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Extract the 10 tab panel HTML blocks and the tab navigation bar from `character-sheet.md` into Jekyll `_includes/` files, reducing the main file from ~1,076 lines to ~30 lines while producing byte-identical rendered output.

**Architecture:** Simple Jekyll `{% include %}` extraction — each tab panel's markup moves to its own `.html` file under `_includes/character-sheet/tabs/`. No JS, CSS, or behavioral changes. The rendered HTML is identical before and after.

**Tech Stack:** Jekyll 3.10 (github-pages gem), Liquid templating, Jest for JS tests

---

## File Structure

**New directory:** `_includes/character-sheet/tabs/`

**Files to create (11):**

- `_includes/character-sheet/tabs/tab-nav.html` — Tab navigation bar
- `_includes/character-sheet/tabs/character.html` — Tab 1: Character info & resources
- `_includes/character-sheet/tabs/abilities.html` — Tab 2: Abilities & bonuses
- `_includes/character-sheet/tabs/inventory.html` — Tab 3: Equipment & inventory
- `_includes/character-sheet/tabs/environment.html` — Tab 4: Buffs & atmospheric conditions
- `_includes/character-sheet/tabs/library.html` — Tab 5: Book library
- `_includes/character-sheet/tabs/campaigns.html` — Tab 5b: Series campaigns
- `_includes/character-sheet/tabs/quests.html` — Tab 6: Monthly tracker & quest cards
- `_includes/character-sheet/tabs/external-curriculum.html` — External curriculum trackers
- `_includes/character-sheet/tabs/archived.html` — Tab 7: Archived quests
- `_includes/character-sheet/tabs/curses.html` — Tab 8: Curse penalties

**File to modify:**

- `character-sheet.md` — Replace all extracted blocks with `{% include %}` tags

---

### Task 0: Capture baseline rendered output

**Files:**
- None modified

- [ ] **Step 1: Build Jekyll and save baseline**

```bash
bundle exec jekyll build -d /tmp/tos-before
```

Expected: Build succeeds, output in `/tmp/tos-before/`.

- [ ] **Step 2: Save the character-sheet.html for diffing later**

```bash
cp /tmp/tos-before/character-sheet.html /tmp/character-sheet-before.html
```

---

### Task 1: Create `_includes/character-sheet/tabs/` directory and extract tab-nav.html

**Files:**
- Create: `_includes/character-sheet/tabs/tab-nav.html`
- Modify: `character-sheet.md`

- [ ] **Step 1: Create the directory**

```bash
mkdir -p _includes/character-sheet/tabs
```

- [ ] **Step 2: Create `_includes/character-sheet/tabs/tab-nav.html`**

Cut lines 10–42 from `character-sheet.md` (the `<nav class="tab-nav">` through closing `</nav>`):

```html
    <nav class="tab-nav" role="tablist">
        <button type="button" data-tab-target="character" class="active" role="tab" aria-selected="true">
            <span>📊</span> Character
        </button>
        <button type="button" data-tab-target="abilities" role="tab" aria-selected="false">
            <span>⚡</span> Abilities
        </button>
        <button type="button" data-tab-target="inventory" role="tab" aria-selected="false">
            <span>🎒</span> Inventory
        </button>
        <button type="button" data-tab-target="environment" role="tab" aria-selected="false">
            <span>🌿</span> Environment
        </button>
        <button type="button" data-tab-target="library" role="tab" aria-selected="false">
            <span>📚</span> Library
        </button>
        <button type="button" data-tab-target="campaigns" role="tab" aria-selected="false">
            <span>🗺️</span> Campaigns
        </button>
        <button type="button" data-tab-target="quests" role="tab" aria-selected="false">
            <span>📅</span> Quests
        </button>
        <button type="button" data-tab-target="external-curriculum" role="tab" aria-selected="false">
            <span>📋</span> External Curriculum
        </button>
        <button type="button" data-tab-target="archived" role="tab" aria-selected="false">
            <span>📦</span> Archived
        </button>
        <button type="button" data-tab-target="curses" role="tab" aria-selected="false">
            <span>💀</span> Curses
        </button>
    </nav>
```

- [ ] **Step 3: Replace the removed block in `character-sheet.md` with the include tag**

Replace lines 10–42 with:

```liquid
    {% include character-sheet/tabs/tab-nav.html %}
```

- [ ] **Step 4: Build and diff**

```bash
bundle exec jekyll build -d /tmp/tos-after
diff /tmp/character-sheet-before.html /tmp/tos-after/character-sheet.html
```

Expected: No diff output (byte-identical).

---

### Task 2: Extract character.html

**Files:**
- Create: `_includes/character-sheet/tabs/character.html`
- Modify: `character-sheet.md`

- [ ] **Step 1: Create `_includes/character-sheet/tabs/character.html`**

Cut lines 44–178 from `character-sheet.md` — from `<!-- TAB 1: CHARACTER INFO & RESOURCES -->` through `<!-- END TAB 1: CHARACTER -->`. Include the opening comment, the `<div class="tab-panel active" data-tab-panel="character">`, all content, the closing `</div>`, and the end comment.

- [ ] **Step 2: Replace in `character-sheet.md`**

Replace the cut block with:

```liquid
{% include character-sheet/tabs/character.html %}
```

- [ ] **Step 3: Build and diff**

```bash
bundle exec jekyll build -d /tmp/tos-after
diff /tmp/character-sheet-before.html /tmp/tos-after/character-sheet.html
```

Expected: No diff.

**Note:** This tab contains a `{{ site.baseurl }}/shopping.html` link in the currency warning div. Liquid tags work correctly inside includes.

---

### Task 3: Extract abilities.html

**Files:**
- Create: `_includes/character-sheet/tabs/abilities.html`
- Modify: `character-sheet.md`

- [ ] **Step 1: Create `_includes/character-sheet/tabs/abilities.html`**

Cut from `<!-- TAB 2: ABILITIES -->` through `<!-- END TAB 2: ABILITIES -->` (the `<div class="tab-panel" data-tab-panel="abilities">` block with all content, closing `</div>`, and both comments).

- [ ] **Step 2: Replace in `character-sheet.md`**

```liquid
{% include character-sheet/tabs/abilities.html %}
```

- [ ] **Step 3: Build and diff**

```bash
bundle exec jekyll build -d /tmp/tos-after
diff /tmp/character-sheet-before.html /tmp/tos-after/character-sheet.html
```

Expected: No diff.

---

### Task 4: Extract inventory.html

**Files:**
- Create: `_includes/character-sheet/tabs/inventory.html`
- Modify: `character-sheet.md`

- [ ] **Step 1: Create `_includes/character-sheet/tabs/inventory.html`**

Cut from `<!-- TAB 3: INVENTORY -->` through `<!-- END TAB 3: INVENTORY -->`.

- [ ] **Step 2: Replace in `character-sheet.md`**

```liquid
{% include character-sheet/tabs/inventory.html %}
```

- [ ] **Step 3: Build and diff**

```bash
bundle exec jekyll build -d /tmp/tos-after
diff /tmp/character-sheet-before.html /tmp/tos-after/character-sheet.html
```

Expected: No diff.

**Note:** Contains `{{ site.baseurl }}/library.html` link in passive equipment section.

---

### Task 5: Extract environment.html

**Files:**
- Create: `_includes/character-sheet/tabs/environment.html`
- Modify: `character-sheet.md`

- [ ] **Step 1: Create `_includes/character-sheet/tabs/environment.html`**

Cut from `<!-- TAB 4: ENVIRONMENT -->` through `<!-- END TAB 4: ENVIRONMENT -->`.

- [ ] **Step 2: Replace in `character-sheet.md`**

```liquid
{% include character-sheet/tabs/environment.html %}
```

- [ ] **Step 3: Build and diff**

```bash
bundle exec jekyll build -d /tmp/tos-after
diff /tmp/character-sheet-before.html /tmp/tos-after/character-sheet.html
```

Expected: No diff.

---

### Task 6: Extract library.html

**Files:**
- Create: `_includes/character-sheet/tabs/library.html`
- Modify: `character-sheet.md`

- [ ] **Step 1: Create `_includes/character-sheet/tabs/library.html`**

Cut from `<!-- TAB 5: LIBRARY -->` through `<!-- END TAB 5: LIBRARY -->`.

- [ ] **Step 2: Replace in `character-sheet.md`**

```liquid
{% include character-sheet/tabs/library.html %}
```

- [ ] **Step 3: Build and diff**

```bash
bundle exec jekyll build -d /tmp/tos-after
diff /tmp/character-sheet-before.html /tmp/tos-after/character-sheet.html
```

Expected: No diff.

---

### Task 7: Extract campaigns.html

**Files:**
- Create: `_includes/character-sheet/tabs/campaigns.html`
- Modify: `character-sheet.md`

- [ ] **Step 1: Create `_includes/character-sheet/tabs/campaigns.html`**

Cut from `<!-- TAB 5b: CAMPAIGNS (series tracker) -->` through `<!-- END TAB 5b: CAMPAIGNS -->`.

- [ ] **Step 2: Replace in `character-sheet.md`**

```liquid
{% include character-sheet/tabs/campaigns.html %}
```

- [ ] **Step 3: Build and diff**

```bash
bundle exec jekyll build -d /tmp/tos-after
diff /tmp/character-sheet-before.html /tmp/tos-after/character-sheet.html
```

Expected: No diff.

---

### Task 8: Extract quests.html

**Files:**
- Create: `_includes/character-sheet/tabs/quests.html`
- Modify: `character-sheet.md`

- [ ] **Step 1: Create `_includes/character-sheet/tabs/quests.html`**

Cut from `<!-- TAB 6: QUESTS -->` through `<!-- END TAB 6: QUESTS -->`. This is the largest tab at ~250 lines, including the bookshelf SVG, monthly tracker, quest tables, card draw interface, and active assignments panel.

- [ ] **Step 2: Replace in `character-sheet.md`**

```liquid
{% include character-sheet/tabs/quests.html %}
```

- [ ] **Step 3: Build and diff**

```bash
bundle exec jekyll build -d /tmp/tos-after
diff /tmp/character-sheet-before.html /tmp/tos-after/character-sheet.html
```

Expected: No diff.

---

### Task 9: Extract external-curriculum.html

**Files:**
- Create: `_includes/character-sheet/tabs/external-curriculum.html`
- Modify: `character-sheet.md`

- [ ] **Step 1: Create `_includes/character-sheet/tabs/external-curriculum.html`**

Cut from `<!-- TAB: EXTERNAL CURRICULUM -->` through `<!-- END TAB: EXTERNAL CURRICULUM -->`.

- [ ] **Step 2: Replace in `character-sheet.md`**

```liquid
{% include character-sheet/tabs/external-curriculum.html %}
```

- [ ] **Step 3: Build and diff**

```bash
bundle exec jekyll build -d /tmp/tos-after
diff /tmp/character-sheet-before.html /tmp/tos-after/character-sheet.html
```

Expected: No diff.

---

### Task 10: Extract archived.html

**Files:**
- Create: `_includes/character-sheet/tabs/archived.html`
- Modify: `character-sheet.md`

- [ ] **Step 1: Create `_includes/character-sheet/tabs/archived.html`**

Cut from `<!-- TAB 7: ARCHIVED QUESTS -->` through `<!-- END TAB 7: ARCHIVED QUESTS -->`.

- [ ] **Step 2: Replace in `character-sheet.md`**

```liquid
{% include character-sheet/tabs/archived.html %}
```

- [ ] **Step 3: Build and diff**

```bash
bundle exec jekyll build -d /tmp/tos-after
diff /tmp/character-sheet-before.html /tmp/tos-after/character-sheet.html
```

Expected: No diff.

---

### Task 11: Extract curses.html

**Files:**
- Create: `_includes/character-sheet/tabs/curses.html`
- Modify: `character-sheet.md`

- [ ] **Step 1: Create `_includes/character-sheet/tabs/curses.html`**

Cut from `<!-- TAB 8: CURSES -->` through `<!-- END TAB 8: CURSES -->`.

- [ ] **Step 2: Replace in `character-sheet.md`**

```liquid
{% include character-sheet/tabs/curses.html %}
```

- [ ] **Step 3: Build and diff**

```bash
bundle exec jekyll build -d /tmp/tos-after
diff /tmp/character-sheet-before.html /tmp/tos-after/character-sheet.html
```

Expected: No diff.

---

### Task 12: Final verification and test suite

**Files:**
- None modified

- [ ] **Step 1: Full Jekyll build**

```bash
bundle exec jekyll build -d /tmp/tos-final
```

Expected: Build succeeds with no warnings.

- [ ] **Step 2: Byte-identical diff against baseline**

```bash
diff /tmp/character-sheet-before.html /tmp/tos-final/character-sheet.html
```

Expected: No output (identical).

- [ ] **Step 3: Run full test suite**

```bash
cd tests && npx jest --verbose 2>&1
```

Expected: All tests pass.

- [ ] **Step 4: Verify `character-sheet.md` line count reduction**

```bash
wc -l character-sheet.md
```

Expected: ~30 lines (down from 1,076).

- [ ] **Step 5: Verify all 11 include files exist**

```bash
ls -1 _includes/character-sheet/tabs/
```

Expected output:
```
abilities.html
archived.html
campaigns.html
character.html
curses.html
environment.html
external-curriculum.html
inventory.html
library.html
quests.html
tab-nav.html
```
