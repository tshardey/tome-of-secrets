# fwr.6 — Tags for Backgrounds Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Convert Archivist and Prophet background effects from legacy conditions (`genre`, `hasTag`) to the `tagMatch` system, and add two new tags to the vocabulary.

**Architecture:** Data-only migration. The `tagMatch` condition system, `EffectRegistry`, and `ModifierPipeline` already fully support this. We add two new tags to `bookTags.json`, update the two background effect conditions in `keeperBackgrounds.json`, update existing integration tests, and regenerate data exports.

**Tech Stack:** JSON data files, Jest tests, `node scripts/generate-data.js`

---

### Task 1: Add new tags to bookTags.json

**Files:**
- Modify: `assets/data/bookTags.json`

- [ ] **Step 1: Add historical-fiction and mythology tags**

Insert after the `classics` entry (line 10) and after the `celestial` entry (line 23):

```json
{ "id": "historical-fiction", "label": "Historical Fiction", "category": "genre" }
```

```json
{ "id": "mythology", "label": "Mythology", "category": "content" }
```

The full file should read (with new entries inserted in logical position):

```json
[
  { "id": "fantasy", "label": "Fantasy", "category": "genre" },
  { "id": "romance", "label": "Romance", "category": "genre" },
  { "id": "sci-fi", "label": "Sci-Fi", "category": "genre" },
  { "id": "mystery", "label": "Mystery", "category": "genre" },
  { "id": "horror", "label": "Horror", "category": "genre" },
  { "id": "literary-fiction", "label": "Literary Fiction", "category": "genre" },
  { "id": "contemporary-fiction", "label": "Contemporary Fiction", "category": "genre" },
  { "id": "non-fiction", "label": "Non-Fiction", "category": "genre" },
  { "id": "classics", "label": "Classics", "category": "genre" },
  { "id": "historical-fiction", "label": "Historical Fiction", "category": "genre" },
  { "id": "series", "label": "Part of a Series", "category": "content" },
  { "id": "dragons", "label": "Dragons / Legendary Creatures", "category": "content" },
  { "id": "fae", "label": "Fae / Faerie", "category": "content" },
  { "id": "nature-magic", "label": "Nature Magic / Plants", "category": "content" },
  { "id": "magic-system", "label": "Magic Systems", "category": "content" },
  { "id": "multiple-pov", "label": "Multiple POV / Narrators", "category": "content" },
  { "id": "non-linear-narrative", "label": "Non-Linear Narrative", "category": "content" },
  { "id": "technology", "label": "Robots / AI / Technology", "category": "content" },
  { "id": "social", "label": "Social Gatherings / Events", "category": "content" },
  { "id": "philosophical", "label": "Faith / Philosophy / Spirituality", "category": "content" },
  { "id": "dark", "label": "Dark Themes", "category": "content" },
  { "id": "new-author", "label": "New-to-You Author", "category": "content" },
  { "id": "celestial", "label": "Celestial Motifs", "category": "content" },
  { "id": "mythology", "label": "Mythology", "category": "content" },
  { "id": "unlocked", "label": "Unlocking / Discovery", "category": "content" }
]
```

- [ ] **Step 2: Run data contract tests to verify tag file is valid**

Run: `cd tests && npx jest dataContracts.test.js --verbose 2>&1 | tail -20`
Expected: PASS (existing tag schema tests accept the new entries)

- [ ] **Step 3: Commit**

```
feat(fwr.6): add historical-fiction and mythology tags to bookTags.json
```

---

### Task 2: Convert Archivist background to tagMatch

**Files:**
- Modify: `assets/data/keeperBackgrounds.json` (lines 28-42, archivist entry)

- [ ] **Step 1: Update the Archivist condition**

Replace the archivist effects condition from:

```json
"condition": {
    "genre": [
        "Non-Fiction",
        "Historical Fiction"
    ]
}
```

To:

```json
"condition": {
    "tagMatch": [
        ["non-fiction"],
        ["historical-fiction"]
    ]
}
```

This means: bonus fires if the book has the `non-fiction` tag OR the `historical-fiction` tag.

- [ ] **Step 2: Run existing tests to check nothing breaks**

Run: `cd tests && npx jest realDataIntegration.test.js --verbose 2>&1 | tail -30`
Expected: The archivist test FAILS because it still uses a `genre` payload instead of `tags`.

- [ ] **Step 3: Commit**

```
feat(fwr.6): convert Archivist background to tagMatch condition
```

---

### Task 3: Convert Prophet background to tagMatch

**Files:**
- Modify: `assets/data/keeperBackgrounds.json` (lines 62-82, prophet entry)

- [ ] **Step 1: Update the Prophet condition**

Replace the prophet effects condition from:

```json
"condition": {
    "hasTag": [
        "religious",
        "spiritual",
        "mythological"
    ]
}
```

To:

```json
"condition": {
    "tagMatch": [
        ["philosophical"],
        ["mythology"],
        ["celestial"]
    ]
}
```

This means: bonus fires if the book has the `philosophical` tag OR the `mythology` tag OR the `celestial` tag.

- [ ] **Step 2: Update the Prophet benefit text**

Change the benefit field from:

```
"Gain a +15 Ink Drop bonus any time you complete a quest by reading a book with a religious, spiritual, or mythological premise."
```

To:

```
"Gain a +15 Ink Drop bonus any time you complete a quest by reading a book with a spiritual, mythological, or celestial premise."
```

- [ ] **Step 3: Run existing tests to check current state**

Run: `cd tests && npx jest realDataIntegration.test.js --verbose 2>&1 | tail -30`
Expected: Both archivist and prophet tests FAIL (payloads use old condition format).

- [ ] **Step 4: Commit**

```
feat(fwr.6): convert Prophet background to tagMatch condition
```

---

### Task 4: Update integration tests for new tagMatch conditions

**Files:**
- Modify: `tests/realDataIntegration.test.js` (lines ~129-150, archivist and prophet test cases)

- [ ] **Step 1: Update the Archivist test payload**

In `tests/realDataIntegration.test.js`, find the archivist test case (around line 129). Change the payload from:

```javascript
{
    id: 'archivist',
    trigger: TRIGGERS.ON_QUEST_COMPLETED,
    payload: TriggerPayload.questCompleted({ questType: 'genre_quest', genre: 'Non-Fiction' }),
    baseReward: new Reward({ inkDrops: 0 }),
    assert: (result) => expect(result.inkDrops).toBe(10),
    sourceName: "The Archivist's Apprentice"
},
```

To:

```javascript
{
    id: 'archivist',
    trigger: TRIGGERS.ON_QUEST_COMPLETED,
    payload: TriggerPayload.questCompleted({ questType: 'genre_quest', tags: ['non-fiction'] }),
    baseReward: new Reward({ inkDrops: 0 }),
    assert: (result) => expect(result.inkDrops).toBe(10),
    sourceName: "The Archivist's Apprentice"
},
```

- [ ] **Step 2: Update the Prophet test payload**

Find the prophet test case (around line 145). Change the payload from:

```javascript
{
    id: 'prophet',
    trigger: TRIGGERS.ON_QUEST_COMPLETED,
    payload: TriggerPayload.questCompleted({ questType: 'genre_quest', tags: ['mythological'] }),
    baseReward: new Reward({ inkDrops: 0 }),
    assert: (result) => expect(result.inkDrops).toBe(15),
    sourceName: 'The Cloistered Prophet'
},
```

To:

```javascript
{
    id: 'prophet',
    trigger: TRIGGERS.ON_QUEST_COMPLETED,
    payload: TriggerPayload.questCompleted({ questType: 'genre_quest', tags: ['mythology'] }),
    baseReward: new Reward({ inkDrops: 0 }),
    assert: (result) => expect(result.inkDrops).toBe(15),
    sourceName: 'The Cloistered Prophet'
},
```

Note: the old tag `mythological` doesn't exist in bookTags.json — the new tag is `mythology`.

- [ ] **Step 3: Update the Archivist double-stack test if it uses genre payload**

Find the test around line 314 (`background bonus does not double-stack with legacy background buff cards`). If the `quest` object uses `genre: 'Non-Fiction'`, add `tags: ['non-fiction']` so the tagMatch condition fires:

```javascript
test('background bonus does not double-stack with legacy background buff cards', () => {
    const result = RewardCalculator.calculateFinalRewards('♥ Organize the Stacks', 'Non-Fiction: archive study', {
        baseRewardOverride: new Reward({ inkDrops: 10 }),
        appliedBuffs: ['[Background] Archivist Bonus'],
        background: 'archivist',
        quest: { type: '♥ Organize the Stacks', genre: 'Non-Fiction', tags: ['non-fiction'] }
    });

    expect(result.inkDrops).toBe(20);
    expect(result.modifiedBy).toContain("The Archivist's Apprentice");
    expect(result.modifiedBy).not.toContain('Archivist Bonus');
});
```

- [ ] **Step 4: Run the updated tests**

Run: `cd tests && npx jest realDataIntegration.test.js --verbose 2>&1 | tail -30`
Expected: ALL PASS

- [ ] **Step 5: Add additional tagMatch coverage for both backgrounds**

Add new test cases to `tests/tagMatch.test.js` at the end of the `tagMatch condition evaluation` describe block to cover the specific background conditions:

```javascript
test('Archivist tagMatch: matches non-fiction tag', () => {
    const condition = { tagMatch: [['non-fiction'], ['historical-fiction']] };
    const payload = { tags: ['non-fiction'] };
    expect(ModifierPipeline.evaluateCondition(condition, payload)).toBe(true);
});

test('Archivist tagMatch: matches historical-fiction tag', () => {
    const condition = { tagMatch: [['non-fiction'], ['historical-fiction']] };
    const payload = { tags: ['historical-fiction'] };
    expect(ModifierPipeline.evaluateCondition(condition, payload)).toBe(true);
});

test('Archivist tagMatch: rejects unrelated tags', () => {
    const condition = { tagMatch: [['non-fiction'], ['historical-fiction']] };
    const payload = { tags: ['fantasy', 'series'] };
    expect(ModifierPipeline.evaluateCondition(condition, payload)).toBe(false);
});

test('Prophet tagMatch: matches philosophical tag', () => {
    const condition = { tagMatch: [['philosophical'], ['mythology'], ['celestial']] };
    const payload = { tags: ['philosophical'] };
    expect(ModifierPipeline.evaluateCondition(condition, payload)).toBe(true);
});

test('Prophet tagMatch: matches mythology tag', () => {
    const condition = { tagMatch: [['philosophical'], ['mythology'], ['celestial']] };
    const payload = { tags: ['mythology'] };
    expect(ModifierPipeline.evaluateCondition(condition, payload)).toBe(true);
});

test('Prophet tagMatch: matches celestial tag', () => {
    const condition = { tagMatch: [['philosophical'], ['mythology'], ['celestial']] };
    const payload = { tags: ['celestial'] };
    expect(ModifierPipeline.evaluateCondition(condition, payload)).toBe(true);
});

test('Prophet tagMatch: rejects unrelated tags', () => {
    const condition = { tagMatch: [['philosophical'], ['mythology'], ['celestial']] };
    const payload = { tags: ['romance', 'series'] };
    expect(ModifierPipeline.evaluateCondition(condition, payload)).toBe(false);
});
```

- [ ] **Step 6: Run all tagMatch tests**

Run: `cd tests && npx jest tagMatch.test.js --verbose 2>&1 | tail -30`
Expected: ALL PASS

- [ ] **Step 7: Commit**

```
test(fwr.6): update integration tests for Archivist and Prophet tagMatch conditions
```

---

### Task 5: Regenerate data exports and run full suite

**Files:**
- Run: `scripts/generate-data.js`

- [ ] **Step 1: Regenerate data exports**

Run: `cd /workspaces/tome-of-secrets && node scripts/generate-data.js`
Expected: Success, no errors

- [ ] **Step 2: Run the full test suite**

Run: `cd tests && npm test 2>&1 | tail -40`
Expected: ALL PASS

- [ ] **Step 3: Commit generated output**

```
chore(fwr.6): regenerate data exports after tagMatch migration
```
