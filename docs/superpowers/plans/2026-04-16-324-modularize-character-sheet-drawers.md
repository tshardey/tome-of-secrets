# Bead 324: Modularize character-sheet.md Drawers — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Extract 12 drawer/overlay HTML blocks from `character-sheet.md` into Jekyll `_includes/` files, reducing the main file by ~380 lines while producing byte-identical rendered output.

**Architecture:** Simple Jekyll `{% include %}` extraction — each drawer's backdrop + panel markup moves to its own `.html` file under `_includes/character-sheet/drawers/`. No JS, CSS, or behavioral changes. The rendered HTML is identical before and after.

**Tech Stack:** Jekyll 3.10 (github-pages gem), Liquid templating, Jest for JS tests

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

### Task 1: Create `_includes/character-sheet/drawers/` directory and extract table-overlay.html

**Files:**
- Create: `_includes/character-sheet/drawers/table-overlay.html`
- Modify: `character-sheet.md`

- [ ] **Step 1: Create the directory**

```bash
mkdir -p _includes/character-sheet/drawers
```

- [ ] **Step 2: Create `_includes/character-sheet/drawers/table-overlay.html`**

Cut lines 1053–1060 from `character-sheet.md` (the `<!-- Table Overlay Panels -->` comment through the closing `</div>` of `table-overlay-panel`):

```html
<!-- Table Overlay Panels -->
<div id="table-overlay-backdrop" class="table-overlay-backdrop"></div>
<div id="table-overlay-panel" class="table-overlay-panel" style="display: none;">
    <button class="close-table-overlay-btn" id="close-table-overlay" aria-label="Close table overlay">&times;</button>
    <div id="table-overlay-content">
        <!-- Table content will be rendered here -->
    </div>
</div>
```

- [ ] **Step 3: Replace the removed block in `character-sheet.md` with the include tag**

Replace the cut lines with:

```liquid
{% include character-sheet/drawers/table-overlay.html %}
```

- [ ] **Step 4: Build and diff**

```bash
bundle exec jekyll build -d /tmp/tos-after
diff /tmp/character-sheet-before.html /tmp/tos-after/character-sheet.html
```

Expected: No diff output (byte-identical).

---

### Task 2: Extract leveling-rewards.html

**Files:**
- Create: `_includes/character-sheet/drawers/leveling-rewards.html`
- Modify: `character-sheet.md`

- [ ] **Step 1: Create `_includes/character-sheet/drawers/leveling-rewards.html`**

Cut the leveling rewards block from `character-sheet.md` — from `<!-- Quest Edit Drawer -->` / `<!-- Leveling Rewards Drawer -->` comment through the closing `</div>` of `leveling-rewards-drawer` (the block starting with `<div id="leveling-rewards-backdrop"` through the matching `</div>`):

```html
<!-- Leveling Rewards Drawer -->
<div id="leveling-rewards-backdrop" class="info-drawer-backdrop"></div>
<div id="leveling-rewards-drawer" class="info-drawer" style="display: none;">
    <div class="info-drawer-header">
        <h2>📈 Leveling Up & Rewards</h2>
        <button class="close-info-drawer-btn" id="close-leveling-rewards" aria-label="Close leveling rewards drawer">&times;</button>
    </div>
    <div class="info-drawer-body">
        <div class="info-drawer-content">
            <p>This document details the Leveling Up & Class Customization expansion for The Tome of Secrets. As the Keeper gains experience, they unlock permanent bonuses and gain School Mastery Points (SMP) to acquire powerful abilities tied to their chosen Magical School.</p>
            
            <h3>Leveling Up Rewards (Levels 1–20)</h3>
            <p>Upon reaching a new level, the Keeper gains the rewards listed in the table below. Permanent Bonuses are gained at levels 3, 6, 7, and 9, and are detailed in the "Permanent Bonuses" section further down.</p>
            
            <div id="leveling-rewards-table" class="tracker-table-container"></div>
            
            <h3>Permanent Bonuses</h3>
            <p>As you level up, you unlock the following permanent abilities at the specified levels.</p>
            
            <div id="permanent-bonuses-table"></div>
        </div>
    </div>
</div>
```

- [ ] **Step 2: Replace in `character-sheet.md`**

Replace the cut block with:

```liquid
{% include character-sheet/drawers/leveling-rewards.html %}
```

Also remove the now-orphaned `<!-- Quest Edit Drawer -->` comment that sat above the leveling rewards block (line 1062), if present.

- [ ] **Step 3: Build and diff**

```bash
bundle exec jekyll build -d /tmp/tos-after
diff /tmp/character-sheet-before.html /tmp/tos-after/character-sheet.html
```

Expected: No diff.

---

### Task 3: Extract school-mastery.html

**Files:**
- Create: `_includes/character-sheet/drawers/school-mastery.html`
- Modify: `character-sheet.md`

- [ ] **Step 1: Create `_includes/character-sheet/drawers/school-mastery.html`**

Cut the school mastery block — from `<!-- School Mastery Abilities Drawer -->` through the closing `</div>` of `school-mastery-drawer`:

```html
<!-- School Mastery Abilities Drawer -->
<div id="school-mastery-backdrop" class="info-drawer-backdrop"></div>
<div id="school-mastery-drawer" class="info-drawer" style="display: none;">
    <div class="info-drawer-header">
        <h2>🧙 School Mastery Abilities</h2>
        <button class="close-info-drawer-btn" id="close-school-mastery" aria-label="Close school mastery drawer">&times;</button>
    </div>
    <div class="info-drawer-body">
        <div class="info-drawer-content">
            <p>Use a School Mastery Point (SMP) to acquire a new, permanent ability from your chosen school. Once you have acquired both abilities from your primary school, you may spend future SMPs to acquire the first ability (costing 1 SMP) from any other Magical School (Multiclassing).</p>
            
            <div id="school-mastery-abilities-content"></div>
        </div>
    </div>
</div>
```

- [ ] **Step 2: Replace in `character-sheet.md`**

```liquid
{% include character-sheet/drawers/school-mastery.html %}
```

- [ ] **Step 3: Build and diff**

```bash
bundle exec jekyll build -d /tmp/tos-after
diff /tmp/character-sheet-before.html /tmp/tos-after/character-sheet.html
```

Expected: No diff.

---

### Task 4: Extract keeper-backgrounds.html

**Files:**
- Create: `_includes/character-sheet/drawers/keeper-backgrounds.html`
- Modify: `character-sheet.md`

- [ ] **Step 1: Create `_includes/character-sheet/drawers/keeper-backgrounds.html`**

```html
<!-- Keeper Backgrounds Drawer -->
<div id="keeper-backgrounds-backdrop" class="info-drawer-backdrop"></div>
<div id="keeper-backgrounds-drawer" class="info-drawer" style="display: none;">
    <div class="info-drawer-header">
        <h2>📖 Keeper Backgrounds</h2>
        <button class="close-info-drawer-btn" id="close-keeper-backgrounds" aria-label="Close keeper backgrounds drawer">&times;</button>
    </div>
    <div class="info-drawer-body">
        <div class="info-drawer-content">
            <p>Before you were a Keeper, you were... something else. This background represents your life before dedicating yourself to the Grand Library, and it grants you a small, permanent benefit born from your past experiences.</p>
            <blockquote><p><strong>Journaling Prompt:</strong> Where does your Keeper come from? What event or calling led them to this life of protecting the Grand Library?</p></blockquote>
            <div id="keeper-backgrounds"></div>
        </div>
    </div>
</div>
```

- [ ] **Step 2: Replace in `character-sheet.md`**

```liquid
{% include character-sheet/drawers/keeper-backgrounds.html %}
```

- [ ] **Step 3: Build and diff**

```bash
bundle exec jekyll build -d /tmp/tos-after
diff /tmp/character-sheet-before.html /tmp/tos-after/character-sheet.html
```

Expected: No diff.

---

### Task 5: Extract wizard-schools.html

**Files:**
- Create: `_includes/character-sheet/drawers/wizard-schools.html`
- Modify: `character-sheet.md`

- [ ] **Step 1: Create `_includes/character-sheet/drawers/wizard-schools.html`**

```html
<!-- Wizard Schools Drawer -->
<div id="wizard-schools-backdrop" class="info-drawer-backdrop"></div>
<div id="wizard-schools-drawer" class="info-drawer" style="display: none;">
    <div class="info-drawer-header">
        <h2>✨ Magical Schools</h2>
        <button class="close-info-drawer-btn" id="close-wizard-schools" aria-label="Close magical schools drawer">&times;</button>
    </div>
    <div class="info-drawer-body">
        <div class="info-drawer-content">
            <p>Every Keeper draws power from a magical school, which grants them unique abilities to aid in their quests. Choose one of the following to be your primary specialization.</p>
            <blockquote><p><strong>Journaling Prompt:</strong> How did you come to study this school of magic? Were you formally trained, or did you stumble upon its secrets?</p></blockquote>
            <div id="wizard-schools"></div>
        </div>
    </div>
</div>
```

- [ ] **Step 2: Replace in `character-sheet.md`**

```liquid
{% include character-sheet/drawers/wizard-schools.html %}
```

- [ ] **Step 3: Build and diff**

```bash
bundle exec jekyll build -d /tmp/tos-after
diff /tmp/character-sheet-before.html /tmp/tos-after/character-sheet.html
```

Expected: No diff.

---

### Task 6: Extract library-sanctums.html

**Files:**
- Create: `_includes/character-sheet/drawers/library-sanctums.html`
- Modify: `character-sheet.md`

- [ ] **Step 1: Create `_includes/character-sheet/drawers/library-sanctums.html`**

```html
<!-- Library Sanctums Drawer -->
<div id="library-sanctums-backdrop" class="info-drawer-backdrop"></div>
<div id="library-sanctums-drawer" class="info-drawer" style="display: none;">
    <div class="info-drawer-header">
        <h2>🏛️ Library Sanctums</h2>
        <button class="close-info-drawer-btn" id="close-library-sanctums" aria-label="Close library sanctums drawer">&times;</button>
    </div>
    <div class="info-drawer-body">
        <div class="info-drawer-content">
            <p>The heart of your adventure is your library, which is also your home. Choosing a type of library grants you a permanent ability that enhances certain Atmospheric Buffs.</p>
            <blockquote><p><strong>Journaling Prompt:</strong> What does your sanctum look, feel, and smell like? Is it a place of comfort and refuge, or one of mystery and ancient dust?</p></blockquote>
            <div id="sanctum-list"></div>
        </div>
    </div>
</div>
```

- [ ] **Step 2: Replace in `character-sheet.md`**

```liquid
{% include character-sheet/drawers/library-sanctums.html %}
```

- [ ] **Step 3: Build and diff**

```bash
bundle exec jekyll build -d /tmp/tos-after
diff /tmp/character-sheet-before.html /tmp/tos-after/character-sheet.html
```

Expected: No diff.

---

### Task 7: Extract genre-quests.html

**Files:**
- Create: `_includes/character-sheet/drawers/genre-quests.html`
- Modify: `character-sheet.md`

- [ ] **Step 1: Create `_includes/character-sheet/drawers/genre-quests.html`**

```html
<!-- Genre Quests Info Drawer -->
<div id="genre-quests-backdrop" class="info-drawer-backdrop"></div>
<div id="genre-quests-drawer" class="info-drawer" style="display: none;">
    <div class="info-drawer-header">
        <h2>♥ Organize the Stacks (Roll a die)</h2>
        <button class="close-info-drawer-btn" id="close-genre-quests" aria-label="Close genre quests drawer">&times;</button>
    </div>
    <div class="info-drawer-body">
        <div class="info-drawer-content">
            <p>Completing an Organize the Stacks quest rewards you with <strong>+15 XP</strong> and <strong>+10 Ink Drops</strong></p>
            
            <blockquote>
                <p><strong>Note:</strong> Genre selection for "Organize the Stacks" quests has been moved to the Character Sheet. Open the Character Sheet and go to the Quests tab, then click "View Genre Quests Table" to select your genres.</p>
            </blockquote>
            
            <h3>Journaling: Organize the Stacks</h3>
            
            <p>These quests represent the routine duties of a Keeper. You are maintaining your Sanctum, sorting chaotic shelves, discovering lost wings, or simply performing slice-of-life maintenance tasks to keep the magic from overflowing.</p>
            
            <ul>
                <li><strong>The Mess:</strong> Why was this section of the library in disarray? How do you go about removing the shroud in this area? Are the books static or do they inexplicably move around?</li>
                <li><strong>The Discovery:</strong> Did you find anything unexpected tucked between the pages while cleaning? Did a certain book call to you as you went about your task?</li>
            </ul>
            
            <div id="genre-quests-table-container"></div>
        </div>
    </div>
</div>
```

- [ ] **Step 2: Replace in `character-sheet.md`**

```liquid
{% include character-sheet/drawers/genre-quests.html %}
```

- [ ] **Step 3: Build and diff**

```bash
bundle exec jekyll build -d /tmp/tos-after
diff /tmp/character-sheet-before.html /tmp/tos-after/character-sheet.html
```

Expected: No diff.

---

### Task 8: Extract atmospheric-buffs.html

**Files:**
- Create: `_includes/character-sheet/drawers/atmospheric-buffs.html`
- Modify: `character-sheet.md`

- [ ] **Step 1: Create `_includes/character-sheet/drawers/atmospheric-buffs.html`**

```html
<!-- Atmospheric Buffs Info Drawer -->
<div id="atmospheric-buffs-info-backdrop" class="info-drawer-backdrop"></div>
<div id="atmospheric-buffs-info-drawer" class="info-drawer" style="display: none;">
    <div class="info-drawer-header">
        <h2>♦ Atmospheric Buffs (Roll a d8)</h2>
        <button class="close-info-drawer-btn" id="close-atmospheric-buffs-info" aria-label="Close atmospheric buffs drawer">&times;</button>
    </div>
    <div class="info-drawer-body">
        <div class="info-drawer-content">
            <p>These buffs are daily bonuses. Once per day, when you set a mood for reading, you can earn +1 Ink Drop.</p>
            
            <h3>Journaling: Atmospheric Buffs</h3>
            
            <p>These entries focus on the sensory experience of the Library. The Grand Library is an organism with its own weather, moods, and shifts. These entries are about how it feels to exist within the walls.</p>
            
            <ul>
                <li><strong>The Senses:</strong> How did this atmospheric change affect your senses? What did the air smell like? Did the warmth of the hearth drive off the winter cold?</li>
                <li><strong>The Memory:</strong> Did the atmosphere trigger a memory for your Keeper?</li>
                <li><strong>The Effect:</strong> Did the atmosphere make your task harder or easier?</li>
            </ul>
            
            <div id="atmospheric-buffs-table-container"></div>
        </div>
    </div>
</div>
```

- [ ] **Step 2: Replace in `character-sheet.md`**

```liquid
{% include character-sheet/drawers/atmospheric-buffs.html %}
```

- [ ] **Step 3: Build and diff**

```bash
bundle exec jekyll build -d /tmp/tos-after
diff /tmp/character-sheet-before.html /tmp/tos-after/character-sheet.html
```

Expected: No diff.

---

### Task 9: Extract side-quests.html

**Files:**
- Create: `_includes/character-sheet/drawers/side-quests.html`
- Modify: `character-sheet.md`

- [ ] **Step 1: Create `_includes/character-sheet/drawers/side-quests.html`**

```html
<!-- Side Quests Info Drawer -->
<div id="side-quests-info-backdrop" class="info-drawer-backdrop"></div>
<div id="side-quests-info-drawer" class="info-drawer" style="display: none;">
    <div class="info-drawer-header">
        <h2>♣ Side Quests (Roll a d8)</h2>
        <button class="close-info-drawer-btn" id="close-side-quests-info" aria-label="Close side quests drawer">&times;</button>
    </div>
    <div class="info-drawer-body">
        <div class="info-drawer-content">
            <p>Completing a side quest rewards you with a magical item or a bonus.</p>
            
            <p><strong>Note:</strong> If you roll a side quest that you have already completed (grayed out in the table below), you may roll again.</p>
            
            <h3>Journaling: Side Quests</h3>
            
            <p>These involve interactions with the Library's denizens. You are not alone here; there are ghosts, lost students, magical portraits, and other entities that require your aid.</p>
            
            <ul>
                <li><strong>The Encounter:</strong> Who or what did you encounter in the stacks? What problem were they facing or what do they want you to do?</li>
                <li><strong>The Result:</strong> How does the book and prompt tie into the encounter? Did the interaction change your relationship with the library? Did you gain a new ally or put a spirit to rest?</li>
            </ul>
            
            <div id="side-quests-table-container"></div>
        </div>
    </div>
</div>
```

- [ ] **Step 2: Replace in `character-sheet.md`**

```liquid
{% include character-sheet/drawers/side-quests.html %}
```

- [ ] **Step 3: Build and diff**

```bash
bundle exec jekyll build -d /tmp/tos-after
diff /tmp/character-sheet-before.html /tmp/tos-after/character-sheet.html
```

Expected: No diff.

---

### Task 10: Extract dungeons.html

**Files:**
- Create: `_includes/character-sheet/drawers/dungeons.html`
- Modify: `character-sheet.md`

- [ ] **Step 1: Create `_includes/character-sheet/drawers/dungeons.html`**

Note: This drawer contains Liquid template tags (`{{ site.baseurl }}`) that will continue to work correctly inside an include file.

```html
<!-- Dungeons Info Drawer -->
<div id="dungeons-info-backdrop" class="info-drawer-backdrop"></div>
<div id="dungeons-info-drawer" class="info-drawer" style="display: none;">
    <div class="info-drawer-header">
        <h2>♠ Dungeon Rooms (Roll a d20)</h2>
        <button class="close-info-drawer-btn" id="close-dungeons-info" aria-label="Close dungeons drawer">&times;</button>
    </div>
    <div class="info-drawer-body">
        <div class="info-drawer-content">
            <p>Draw cards to determine your dungeon room and encounter. Each room offers a narrative challenge and encounter. Complete both to earn the rewards for the room. Complete all dungeon rooms to be able to roll on the <a href="#dungeon-completion-rewards">Dungeon Completion Rewards</a> table. Each room belongs to a wing of the library—explore the <a href="{{ site.baseurl }}/library.html">Library Restoration</a> page to see how your progress unlocks restoration projects.</p>
            
            <p><strong>Note:</strong> Rooms stay in the deck until all encounters are completed. If you have only completed one encounter in a room, you may draw from that room again to complete the remaining encounters.</p>
            
            <h3>Journaling: Dungeon Crawls</h3>
            
            <p>These are the high-stakes moments of your story. You are venturing into dangerous, unchecked parts of the library to face hostile magical threats. You must weave together the Room, the Creature, and the Book into a narrative.</p>
            
            <ul>
                <li><strong>The Setting:</strong> Describe the room. What made it dangerous or unique? How did the room's mechanics physically manifest around you?</li>
                <li><strong>The Encounter:</strong> How did the creature appear? Did it crawl out of a book? Did it form from the shadows? Was it friendly or confrontational? What elements of the book impacted the encounter? How did fulfilling the specific prompt translate into something useful for dealing with the creature?</li>
            </ul>
            
            <h3>Dungeon Rewards & Penalties</h3>
            <div id="dungeon-rewards-table-container"></div>
            
            <br>
            
            <div id="dungeon-rooms-table-container"></div>
            
            <h3 id="dungeon-completion-rewards">♠ Dungeon Completion Rewards</h3>
            <p>Complete a dungeon room and click "Claim Reward" above to earn a draw. You have <strong><span id="dungeon-completion-draws-available">0</span></strong> draw(s) to use.</p>
            <div class="form-row" style="margin-bottom: 12px;">
                <button type="button" id="draw-dungeon-completion-card-btn" class="rpg-btn rpg-btn-primary">Draw item</button>
            </div>
            <div id="dungeon-completion-drawn-card-container" style="min-height: 0; margin-bottom: 12px;"></div>
            <div id="dungeon-completion-rewards-table-container"></div>
        </div>
    </div>
</div>
```

- [ ] **Step 2: Replace in `character-sheet.md`**

```liquid
{% include character-sheet/drawers/dungeons.html %}
```

- [ ] **Step 3: Build and diff**

```bash
bundle exec jekyll build -d /tmp/tos-after
diff /tmp/character-sheet-before.html /tmp/tos-after/character-sheet.html
```

Expected: No diff.

---

### Task 11: Extract book-edit.html

**Files:**
- Create: `_includes/character-sheet/drawers/book-edit.html`
- Modify: `character-sheet.md`

- [ ] **Step 1: Create `_includes/character-sheet/drawers/book-edit.html`**

Cut the entire book edit drawer block — from `<div id="book-edit-backdrop"` through the closing `</div>` of `book-edit-drawer`:

```html
<div id="book-edit-backdrop" class="quest-edit-backdrop book-edit-backdrop"></div>
<div id="book-edit-drawer" class="quest-edit-drawer book-edit-drawer" style="display: none;">
    <div class="quest-edit-header">
        <h2 id="book-edit-header-title">Edit Book</h2>
        <button type="button" class="close-quest-edit-btn" id="close-book-edit" aria-label="Close book edit drawer">&times;</button>
    </div>
    <div class="quest-edit-body">
        <form id="book-edit-form">
            <input type="hidden" id="book-edit-id" value="" />
            <div class="form-row book-edit-search-row">
                <label for="book-edit-search-query"><strong>Look up book:</strong></label>
                <div class="library-search-input-and-results">
                    <div class="library-search-wrap">
                        <input type="text" id="book-edit-search-query" class="library-title-input" placeholder="Search to update title, author, cover…" autocomplete="off" aria-label="Search for book details" />
                        <button type="button" id="book-edit-search-btn" class="rpg-btn rpg-btn-secondary lookup-book-btn" title="Search API for book details">Look up</button>
                    </div>
                    <div id="book-edit-search-results" class="book-search-results library-search-results" aria-live="polite" style="display: none;"></div>
                </div>
            </div>
            <div class="form-row">
                <label for="book-edit-title"><strong>Title:</strong></label>
                <input type="text" id="book-edit-title" placeholder="Book Title" required />
            </div>
            <div class="form-row">
                <label for="book-edit-author"><strong>Author (optional):</strong></label>
                <input type="text" id="book-edit-author" placeholder="Author" />
            </div>
            <div class="form-row book-edit-cover-row">
                <label><strong>Cover:</strong></label>
                <div class="library-cover-fields">
                    <div class="library-cover-preview-wrap">
                        <img id="book-edit-cover-preview" class="library-cover-preview" src="" alt="" role="presentation" style="display: none;">
                        <span id="book-edit-cover-placeholder" class="library-cover-placeholder">No cover</span>
                    </div>
                    <div class="library-cover-inputs">
                        <input type="url" id="book-edit-cover-url" class="library-cover-url-input" placeholder="Cover image URL" value="" />
                        <label for="book-edit-cover-upload" class="library-cover-upload-label">Upload</label>
                        <input type="file" id="book-edit-cover-upload" class="library-cover-upload-input" accept="image/*" />
                        <input type="hidden" id="book-edit-cover-value" value="" />
                    </div>
                </div>
            </div>
            <div class="form-row">
                <label for="book-edit-page-count"><strong>Page count (optional):</strong></label>
                <input type="number" id="book-edit-page-count" class="library-page-count-input" min="1" placeholder="—" value="" />
            </div>
            <div class="form-row">
                <label for="book-edit-status"><strong>Status:</strong></label>
                <select id="book-edit-status" class="rpg-select">
                    <option value="reading">Reading</option>
                    <option value="completed">Completed</option>
                    <option value="other">Other</option>
                </select>
            </div>
            <div class="form-row">
                <label for="book-edit-shelf-category"><strong>Shelf:</strong></label>
                <select id="book-edit-shelf-category" class="rpg-select">
                    <option value="general">General library</option>
                    <option value="physical-tbr">Physical TBR</option>
                </select>
            </div>
            <div class="form-row" id="book-edit-date-completed-row">
                <label for="book-edit-date-completed"><strong>Date completed (optional):</strong></label>
                <input type="date" id="book-edit-date-completed" class="library-date-input" placeholder="YYYY-MM-DD" aria-label="Date book was completed" />
            </div>
            <div class="form-row">
                <label for="book-edit-series"><strong>Series (Campaign):</strong></label>
                <select id="book-edit-series" class="rpg-select" aria-label="Tag this book to a series">
                    <option value="">— None —</option>
                </select>
            </div>
            <div id="book-edit-links-section" class="form-row book-edit-links" style="display: none;">
                <label><strong>Linked:</strong></label>
                <div id="book-edit-links-display" class="book-edit-links-display"></div>
            </div>
            <div class="quest-edit-actions">
                <button type="button" id="save-book-edit-btn" class="save-quest-btn">Save</button>
                <button type="button" id="cancel-book-edit-btn" class="cancel-quest-btn">Cancel</button>
            </div>
        </form>
    </div>
</div>
```

- [ ] **Step 2: Replace in `character-sheet.md`**

```liquid
{% include character-sheet/drawers/book-edit.html %}
```

- [ ] **Step 3: Build and diff**

```bash
bundle exec jekyll build -d /tmp/tos-after
diff /tmp/character-sheet-before.html /tmp/tos-after/character-sheet.html
```

Expected: No diff.

---

### Task 12: Extract quest-edit.html

**Files:**
- Create: `_includes/character-sheet/drawers/quest-edit.html`
- Modify: `character-sheet.md`

- [ ] **Step 1: Create `_includes/character-sheet/drawers/quest-edit.html`**

Cut the entire quest edit drawer block — from `<div id="quest-edit-backdrop"` through the closing `</div>` of `quest-edit-drawer`:

```html
<div id="quest-edit-backdrop" class="quest-edit-backdrop"></div>
<div id="quest-edit-drawer" class="quest-edit-drawer" style="display: none;">
    <div class="quest-edit-header">
        <h2 id="quest-edit-header-title">Editing Quest</h2>
        <button class="close-quest-edit-btn" id="close-quest-edit" aria-label="Close quest edit drawer">&times;</button>
    </div>
    <div class="quest-edit-body">
        <form id="quest-edit-form">
            <div class="form-row">
                <label for="edit-quest-month"><strong>Month:</strong></label>
                <select id="edit-quest-month">
                    <option value="">-- Select Month --</option>
                    <option value="January">January</option>
                    <option value="February">February</option>
                    <option value="March">March</option>
                    <option value="April">April</option>
                    <option value="May">May</option>
                    <option value="June">June</option>
                    <option value="July">July</option>
                    <option value="August">August</option>
                    <option value="September">September</option>
                    <option value="October">October</option>
                    <option value="November">November</option>
                    <option value="December">December</option>
                </select>
            </div>
            <div class="form-row">
                <label for="edit-quest-year"><strong>Year:</strong></label>
                <select id="edit-quest-year">
                    <option value="">-- Select Year --</option>
                </select>
            </div>
            <div class="form-row edit-quest-date-completed-row">
                <label><strong>Date completed:</strong></label>
                <span id="edit-quest-date-completed-display" class="edit-quest-date-completed-display"></span>
            </div>
            <div class="form-row">
                <label for="edit-quest-type"><strong>Quest Type:</strong></label>
                <select id="edit-quest-type" disabled>
                    <option value="">-- Quest Type --</option>
                    <option value="♠ Dungeon Crawl">♠ Dungeon Crawl</option>
                    <option value="♣ Side Quest">♣ Side Quest</option>
                    <option value="♥ Organize the Stacks">♥ Organize the Stacks</option>
                    <option value="🔨 Restoration Project">🔨 Restoration Project</option>
                    <option value="⭐ Extra Credit">⭐ Extra Credit</option>
                </select>
            </div>
            <div class="form-row">
                <label><strong>Status:</strong></label>
                <span id="edit-quest-status-display" class="quest-status-badge"></span>
            </div>
            <div id="edit-quest-prompt-section" class="quest-edit-section">
                <label><strong>Prompt:</strong></label>
                <div id="edit-quest-prompt-display" class="quest-prompt-display"></div>
            </div>
            <div class="form-row edit-quest-book-row">
                <label><strong>Book:</strong></label>
                <input type="hidden" id="edit-quest-book-id" value="" />
                <div id="edit-quest-legacy-book-display" class="edit-quest-legacy-book-display" style="display: none;"></div>
                <div id="edit-quest-book-selector-container" class="book-selector-container" aria-label="Link a book from your library"></div>
            </div>
            <div class="form-row">
                <label for="edit-quest-notes"><strong>Notes (optional):</strong></label>
                <textarea id="edit-quest-notes" placeholder="Notes" rows="5"></textarea>
            </div>
            <div class="form-row">
                <label style="display: block; margin-bottom: 10px;"><strong>Applicable Buffs & Items:</strong></label>
                <div id="edit-quest-bonus-selection-container" class="quest-bonus-selection-container">
                    <p class="no-bonuses-message" style="color: #8a7a61; font-style: italic; padding: 20px; text-align: center;">No bonuses available. Equip items or activate buffs to see them here.</p>
                </div>
                <input type="hidden" id="edit-quest-buffs-select" />
            </div>
            <div class="quest-edit-actions">
                <button type="button" id="save-quest-changes-btn" class="save-quest-btn">Save Changes</button>
                <button type="button" id="cancel-quest-edit-btn" class="cancel-quest-btn">Cancel</button>
            </div>
        </form>
    </div>
</div>
```

- [ ] **Step 2: Replace in `character-sheet.md`**

```liquid
{% include character-sheet/drawers/quest-edit.html %}
```

- [ ] **Step 3: Build and diff**

```bash
bundle exec jekyll build -d /tmp/tos-after
diff /tmp/character-sheet-before.html /tmp/tos-after/character-sheet.html
```

Expected: No diff.

---

### Task 13: Final verification and test suite

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

Expected: ~1,065 lines (down from 1,447).

- [ ] **Step 5: Verify all 12 include files exist**

```bash
ls -1 _includes/character-sheet/drawers/
```

Expected output:
```
atmospheric-buffs.html
book-edit.html
dungeons.html
genre-quests.html
keeper-backgrounds.html
leveling-rewards.html
library-sanctums.html
quest-edit.html
school-mastery.html
side-quests.html
table-overlay.html
wizard-schools.html
```

---

### Task 14: Create follow-up bead for tab panel extraction

**Files:**
- None (bead system only)

- [ ] **Step 1: Create a new bead for tab panel extraction**

```bash
bd create --title "Extract character-sheet.md tab panels into Jekyll includes" --priority 1
```

This tracks the remaining modularization work: extracting the 10 tab panels (Character, Abilities, Inventory, Environment, Library, Campaigns, Quests, External Curriculum, Archived, Curses) into `_includes/character-sheet/tabs/`.
