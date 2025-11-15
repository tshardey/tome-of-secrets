# Game Data Directory

This directory contains JSON files that serve as the **source of truth** for game content.

## Workflow

1. **Edit JSON files** - Make changes to content in the JSON files here
2. **Generate JS exports** - Run the build script:
   ```bash
   node scripts/generate-data.js
   ```
3. **Test** - Verify changes work correctly

## Current JSON Files

- `xpLevels.json` - XP requirements for each level
- `permanentBonuses.json` - Level-up bonuses
- `atmosphericBuffs.json` - Available atmospheric reading buffs

## Adding New Data

To migrate more data from `data.js` to JSON:

1. Create a new JSON file in this directory (e.g., `schoolBenefits.json`)
2. Add the mapping in `scripts/generate-data.js`:
   ```javascript
   const JSON_EXPORTS = {
       // ... existing mappings
       'schoolBenefits.json': 'schoolBenefits',
   };
   ```
3. Run `node scripts/generate-data.js`
4. Update `data.js` to import from `data.json-exports.js` instead of defining inline

## Benefits

- ✅ Easy to edit without JavaScript knowledge
- ✅ Clear separation of content vs. code
- ✅ Easy version control (git diffs are cleaner)
- ✅ Can validate JSON schema in the future
- ✅ Foundation for future content editor tools

