/**
 * Catalog bans for the dollar economy (see docs/superpowers/specs/2026-11-08-dollar-economy-design.md).
 *
 * Pure functions, shared by scripts/validate-data.js and the Jest suite, so the rule lives in one place.
 * A catalog file fails when it contains:
 *   - a MULTIPLY modifier (every bonus is a flat amount), or any legacy `*Multiplier` key
 *   - an `inkDrops` / `paperScraps` key or resource
 *   - a side-quest stake `multiply` / `halve` key
 *   - "Ink Drop", "Paper Scrap", "Worn Page" or "journal" wording in any text field (case-insensitive)
 */

/** Retired currencies: never a key or a resource in catalog JSON. */
export const BANNED_CURRENCY_KEYS = Object.freeze(['inkDrops', 'paperScraps']);

/** Stake operations that multiply or divide a reward. */
export const BANNED_STAKE_KEYS = Object.freeze(['multiply', 'halve']);

/** Retired wording in catalog text. ("Page Scrap" is an old typo of Paper Scrap.) */
export const BANNED_TEXT_PATTERN = /\bink drops?\b|\bpaper scraps?\b|\bpage scraps?\b|\bworn pages?\b|\bjournal(?!is[mt])/i;

/**
 * Catalog files excluded from the bans. shoppingOptions.json is still priced in Ink/Paper and is
 * deleted with the shopping page (dollar-economy plan, Task 7); drop it from here then.
 */
export const BAN_EXEMPT_FILES = Object.freeze(new Set(['shoppingOptions.json']));

/**
 * Walk one parsed catalog file and return a message for every banned construct.
 * @param {string} filename - e.g. "allItems.json" (used in messages)
 * @param {unknown} json - parsed file contents
 * @returns {string[]}
 */
export function findCatalogBanViolations(filename, json) {
    const violations = [];

    const visit = (value, path) => {
        if (Array.isArray(value)) {
            value.forEach((entry, index) => visit(entry, `${path}[${index}]`));
            return;
        }
        if (value && typeof value === 'object') {
            for (const [key, child] of Object.entries(value)) {
                const childPath = path ? `${path}.${key}` : key;
                if (BANNED_CURRENCY_KEYS.includes(key)) {
                    violations.push(`${filename}: ${childPath} uses retired currency key "${key}"`);
                }
                if (BANNED_STAKE_KEYS.includes(key)) {
                    violations.push(`${filename}: ${childPath} is a "${key}" stake; stakes must be flat amounts`);
                }
                if (/multiplier$/i.test(key)) {
                    violations.push(`${filename}: ${childPath} is a multiplier; bonuses must be flat amounts`);
                }
                visit(child, childPath);
            }
            return;
        }
        if (typeof value !== 'string') {
            return;
        }
        if (value === 'MULTIPLY') {
            violations.push(`${filename}: ${path} is a MULTIPLY modifier; bonuses must be flat amounts`);
        } else if (BANNED_CURRENCY_KEYS.includes(value)) {
            violations.push(`${filename}: ${path} targets retired currency "${value}"`);
        } else if (BANNED_TEXT_PATTERN.test(value)) {
            violations.push(`${filename}: ${path} has retired wording: "${value}"`);
        }
    };

    visit(json, '');
    return violations;
}
