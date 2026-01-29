#!/usr/bin/env node
/**
 * Data Validation Script
 * 
 * Validates game data JSON files for:
 * - Unique IDs within categories
 * - ID format (kebab-case)
 * - Cross-references (items, rooms, wings)
 * - Required fields
 * - Type validation
 * - Duplicate display names
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const DATA_DIR = path.join(__dirname, '..', 'assets', 'data');

// Color codes for terminal output
const RESET = '\x1b[0m';
const GREEN = '\x1b[32m';
const RED = '\x1b[31m';
const YELLOW = '\x1b[33m';
const BLUE = '\x1b[34m';

const results = {
    errors: [],
    warnings: [],
    validated: []
};

/**
 * Check if string is kebab-case (lowercase, hyphens, numbers)
 */
function isKebabCase(str) {
    return /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(str);
}

/**
 * Load JSON file
 */
function loadJSON(filename) {
    const filepath = path.join(DATA_DIR, filename);
    try {
        const content = fs.readFileSync(filepath, 'utf8');
        return JSON.parse(content);
    } catch (error) {
        results.errors.push(`Failed to load ${filename}: ${error.message}`);
        return null;
    }
}

/**
 * Validate items
 */
function validateItems(items) {
    const ids = new Set();
    const names = new Map(); // name -> [ids with that name]
    const results = [];

    for (const [key, item] of Object.entries(items)) {
        // Required fields
        if (!item.id) {
            results.push({ type: 'error', message: `Item "${key}" missing id field` });
        } else {
            // ID format
            if (!isKebabCase(item.id)) {
                results.push({ type: 'error', message: `Item "${key}" has invalid ID format: "${item.id}" (must be kebab-case)` });
            }
            
            // Unique IDs
            if (ids.has(item.id)) {
                results.push({ type: 'error', message: `Duplicate item ID: "${item.id}"` });
            }
            ids.add(item.id);
        }

        if (!item.name) {
            results.push({ type: 'error', message: `Item "${key}" missing name field` });
        } else {
            // Track names for duplicate check
            if (!names.has(item.name)) {
                names.set(item.name, []);
            }
            names.get(item.name).push(item.id || key);
        }

        // Type validation
        if (item.rewardModifier && typeof item.rewardModifier !== 'object') {
            results.push({ type: 'error', message: `Item "${key}" has invalid rewardModifier (must be object)` });
        }

        // Image path check
        if (item.img && typeof item.img !== 'string') {
            results.push({ type: 'error', message: `Item "${key}" has invalid img field (must be string)` });
        }
    }

    // Check for duplicate names
    for (const [name, idsWithName] of names.entries()) {
        if (idsWithName.length > 1) {
            results.push({ 
                type: 'warning', 
                message: `Duplicate item name "${name}" found in items: ${idsWithName.join(', ')}` 
            });
        }
    }

    return results;
}

/**
 * Validate genre quests
 */
function validateGenreQuests(quests) {
    const ids = new Set();
    const results = [];

    for (const [key, quest] of Object.entries(quests)) {
        if (!quest.id) {
            results.push({ type: 'error', message: `Genre quest "${key}" missing id field` });
        } else {
            if (!isKebabCase(quest.id)) {
                results.push({ type: 'error', message: `Genre quest "${key}" has invalid ID format: "${quest.id}"` });
            }
            if (ids.has(quest.id)) {
                results.push({ type: 'error', message: `Duplicate genre quest ID: "${quest.id}"` });
            }
            ids.add(quest.id);
        }

        // Validate rewards structure
        if (quest.rewards) {
            if (typeof quest.rewards.xp !== 'number') {
                results.push({ type: 'error', message: `Genre quest "${key}" has invalid xp (must be number)` });
            }
            if (quest.rewards.items && !Array.isArray(quest.rewards.items)) {
                results.push({ type: 'error', message: `Genre quest "${key}" has invalid items array` });
            }
        }
    }

    return results;
}

/**
 * Validate side quests
 */
function validateSideQuests(quests, itemsById, temporaryBuffs, temporaryBuffsFromRewards) {
    const ids = new Set();
    const results = [];

    // Build lookup for temporary buffs by name
    const allTemporaryBuffs = new Set();
    if (temporaryBuffs) {
        Object.values(temporaryBuffs).forEach(buff => {
            if (buff.name) allTemporaryBuffs.add(buff.name);
            // Also add by key for backward compatibility
            Object.keys(temporaryBuffs).forEach(key => allTemporaryBuffs.add(key));
        });
    }
    if (temporaryBuffsFromRewards) {
        Object.values(temporaryBuffsFromRewards).forEach(buff => {
            if (buff.name) allTemporaryBuffs.add(buff.name);
            // Also add by key for backward compatibility
            Object.keys(temporaryBuffsFromRewards).forEach(key => allTemporaryBuffs.add(key));
        });
    }

    for (const [key, quest] of Object.entries(quests)) {
        if (!quest.id) {
            results.push({ type: 'error', message: `Side quest "${key}" missing id field` });
        } else {
            if (!isKebabCase(quest.id)) {
                results.push({ type: 'error', message: `Side quest "${key}" has invalid ID format: "${quest.id}"` });
            }
            if (ids.has(quest.id)) {
                results.push({ type: 'error', message: `Duplicate side quest ID: "${quest.id}"` });
            }
            ids.add(quest.id);
        }

        // Validate item references in rewards
        if (quest.rewards && quest.rewards.items) {
            for (const itemName of quest.rewards.items) {
                if (typeof itemName !== 'string') {
                    results.push({ type: 'error', message: `Side quest "${key}" has invalid item name in rewards` });
                } else {
                    // Check if item exists by name or ID (backward compatibility)
                    const itemExists = itemsById.has(itemName) || 
                                     Array.from(itemsById.values()).some(item => item.name === itemName || item.id === itemName);
                    // Also check if it's a temporary buff (which is valid)
                    const isTemporaryBuff = allTemporaryBuffs.has(itemName);
                    if (!itemExists && !isTemporaryBuff) {
                        results.push({ 
                            type: 'warning', 
                            message: `Side quest "${key}" references "${itemName}" in rewards, but neither item nor temporary buff found` 
                        });
                    }
                }
            }
        }
    }

    return results;
}

/**
 * Validate dungeon rooms
 */
function validateDungeonRooms(rooms, wingsById) {
    const ids = new Set();
    const results = [];

    for (const [key, room] of Object.entries(rooms)) {
        if (!room.id) {
            results.push({ type: 'error', message: `Dungeon room "${key}" missing id field` });
        } else {
            if (!isKebabCase(room.id)) {
                results.push({ type: 'error', message: `Dungeon room "${key}" has invalid ID format: "${room.id}"` });
            }
            if (ids.has(room.id)) {
                results.push({ type: 'error', message: `Duplicate dungeon room ID: "${room.id}"` });
            }
            ids.add(room.id);
        }

        // Validate wingId reference
        if (room.wingId) {
            if (!wingsById.has(room.wingId)) {
                results.push({ 
                    type: 'error', 
                    message: `Dungeon room "${key}" references invalid wingId: "${room.wingId}"` 
                });
            }
        }

        // Validate encounters
        if (room.encounters) {
            for (const [encounterName, encounter] of Object.entries(room.encounters)) {
                if (encounter.befriend && typeof encounter.befriend !== 'string') {
                    results.push({ type: 'error', message: `Room "${key}" encounter "${encounterName}" has invalid befriend` });
                }
                if (encounter.defeat && typeof encounter.defeat !== 'string') {
                    results.push({ type: 'error', message: `Room "${key}" encounter "${encounterName}" has invalid defeat` });
                }
            }
        }
    }

    return results;
}

/**
 * Validate wings
 */
function validateWings(wings, roomsById) {
    const ids = new Set();
    const results = [];

    for (const [key, wing] of Object.entries(wings)) {
        if (!wing.id) {
            results.push({ type: 'error', message: `Wing "${key}" missing id field` });
        } else {
            if (!isKebabCase(wing.id)) {
                results.push({ type: 'error', message: `Wing "${key}" has invalid ID format: "${wing.id}"` });
            }
            if (ids.has(wing.id)) {
                results.push({ type: 'error', message: `Duplicate wing ID: "${wing.id}"` });
            }
            ids.add(wing.id);
        }

        // Validate room references
        if (wing.rooms && Array.isArray(wing.rooms)) {
            for (const roomNumber of wing.rooms) {
                if (!roomsById.has(roomNumber)) {
                    results.push({ 
                        type: 'warning', 
                        message: `Wing "${key}" references room "${roomNumber}" but room not found` 
                    });
                }
            }
        }
    }

    return results;
}

/**
 * Validate curses
 */
function validateCurses(curses) {
    const ids = new Set();
    const results = [];

    for (const [key, curse] of Object.entries(curses)) {
        if (!curse.id) {
            results.push({ type: 'error', message: `Curse "${key}" missing id field` });
        } else {
            if (!isKebabCase(curse.id)) {
                results.push({ type: 'error', message: `Curse "${key}" has invalid ID format: "${curse.id}"` });
            }
            if (ids.has(curse.id)) {
                results.push({ type: 'error', message: `Duplicate curse ID: "${curse.id}"` });
            }
            ids.add(curse.id);
        }
    }

    return results;
}

/**
 * Validate abilities
 */
function validateAbilities(abilities) {
    const ids = new Set();
    const results = [];

    for (const [key, ability] of Object.entries(abilities)) {
        if (!ability.id) {
            results.push({ type: 'error', message: `Ability "${key}" missing id field` });
        } else {
            if (!isKebabCase(ability.id)) {
                results.push({ type: 'error', message: `Ability "${key}" has invalid ID format: "${ability.id}"` });
            }
            if (ids.has(ability.id)) {
                results.push({ type: 'error', message: `Duplicate ability ID: "${ability.id}"` });
            }
            ids.add(ability.id);
        }

        if (!ability.name) {
            results.push({ type: 'error', message: `Ability "${key}" missing name field` });
        }
    }

    return results;
}

/**
 * Validate buffs
 */
function validateBuffs(buffs, buffType) {
    const ids = new Set();
    const results = [];

    for (const [key, buff] of Object.entries(buffs)) {
        if (!buff.id) {
            results.push({ type: 'error', message: `${buffType} "${key}" missing id field` });
        } else {
            if (!isKebabCase(buff.id)) {
                results.push({ type: 'error', message: `${buffType} "${key}" has invalid ID format: "${buff.id}"` });
            }
            if (ids.has(buff.id)) {
                results.push({ type: 'error', message: `Duplicate ${buffType} ID: "${buff.id}"` });
            }
            ids.add(buff.id);
        }

        if (!buff.name) {
            results.push({ type: 'error', message: `${buffType} "${key}" missing name field` });
        }
    }

    return results;
}

/**
 * Validate restoration projects
 */
function validateRestorationProjects(projects, wingsById) {
    const results = [];
    // Restoration projects use keys as IDs, so we validate key format
    const ids = new Set();

    for (const [key, project] of Object.entries(projects)) {
        // Key should be kebab-case (it's the ID)
        if (!isKebabCase(key)) {
            results.push({ type: 'error', message: `Restoration project "${key}" has invalid key format (must be kebab-case)` });
        }
        if (ids.has(key)) {
            results.push({ type: 'error', message: `Duplicate restoration project key: "${key}"` });
        }
        ids.add(key);

        // Validate wingId reference if present
        if (project.wingId && !wingsById.has(project.wingId)) {
            results.push({ 
                type: 'error', 
                message: `Restoration project "${key}" references invalid wingId: "${project.wingId}"` 
            });
        }
    }

    return results;
}

/**
 * Validate expansions manifest
 */
function validateExpansions(expansions) {
    const results = [];

    // Validate core
    if (!expansions.core) {
        results.push({ type: 'error', message: 'Expansions manifest missing "core" entry' });
        return results; // Can't continue without core
    }

    if (!expansions.core.enabled) {
        results.push({ type: 'warning', message: 'Core expansion is disabled (should be enabled)' });
    }

    // Check that all declared dataFiles exist
    const allDataFiles = new Set();
    if (expansions.core.dataFiles) {
        expansions.core.dataFiles.forEach(file => allDataFiles.add(file));
    }

    if (expansions.expansions) {
        for (const [expansionId, expansion] of Object.entries(expansions.expansions)) {
            if (!isKebabCase(expansionId)) {
                results.push({ type: 'warning', message: `Expansion ID "${expansionId}" is not kebab-case` });
            }

            // Check dependencies
            if (expansion.requires) {
                for (const dep of expansion.requires) {
                    if (dep === 'core') {
                        // Core is always available
                        continue;
                    }
                    if (!expansions.expansions[dep]) {
                        results.push({ 
                            type: 'error', 
                            message: `Expansion "${expansionId}" requires "${dep}" but it doesn't exist` 
                        });
                    }
                }
            }

            // Check dataFiles exist
            if (expansion.dataFiles) {
                expansion.dataFiles.forEach(file => {
                    allDataFiles.add(file);
                    const filepath = path.join(DATA_DIR, file);
                    if (!fs.existsSync(filepath)) {
                        results.push({ 
                            type: 'error', 
                            message: `Expansion "${expansionId}" declares dataFile "${file}" but file doesn't exist` 
                        });
                    }
                });
            }
        }
    }

    return results;
}

/**
 * Main validation function
 */
function validateAll() {
    console.log(`${BLUE}Validating game data files...${RESET}\n`);

    // Load all data files
    const items = loadJSON('allItems.json');
    const genreQuests = loadJSON('genreQuests.json');
    const sideQuests = loadJSON('sideQuestsDetailed.json');
    const dungeonRooms = loadJSON('dungeonRooms.json');
    const wings = loadJSON('wings.json');
    const curses = loadJSON('curseTableDetailed.json');
    const abilities = loadJSON('masteryAbilities.json');
    const atmosphericBuffs = loadJSON('atmosphericBuffs.json');
    const temporaryBuffs = loadJSON('temporaryBuffs.json');
    const temporaryBuffsFromRewards = loadJSON('temporaryBuffsFromRewards.json');
    const restorationProjects = loadJSON('restorationProjects.json');
    const expansions = loadJSON('expansions.json');

    if (!items || !genreQuests || !sideQuests || !dungeonRooms || !wings || !expansions) {
        console.log(`${RED}Fatal: Required data files missing${RESET}\n`);
        return false;
    }

    // Build lookup maps
    const itemsById = new Map(Object.entries(items).map(([k, v]) => [v.id || k, v]));
    const wingsById = new Set(Object.keys(wings));
    const roomsById = new Set(Object.keys(dungeonRooms));

    // Validate each data type
    console.log(`${BLUE}Validating items...${RESET}`);
    validateItems(items).forEach(r => {
        if (r.type === 'error') results.errors.push(r.message);
        else results.warnings.push(r.message);
    });
    results.validated.push({ category: 'Items', count: Object.keys(items).length });

    console.log(`${BLUE}Validating genre quests...${RESET}`);
    validateGenreQuests(genreQuests).forEach(r => {
        if (r.type === 'error') results.errors.push(r.message);
        else results.warnings.push(r.message);
    });
    results.validated.push({ category: 'Genre Quests', count: Object.keys(genreQuests).length });

    console.log(`${BLUE}Validating side quests...${RESET}`);
    validateSideQuests(sideQuests, itemsById, temporaryBuffs, temporaryBuffsFromRewards).forEach(r => {
        if (r.type === 'error') results.errors.push(r.message);
        else results.warnings.push(r.message);
    });
    results.validated.push({ category: 'Side Quests', count: Object.keys(sideQuests).length });

    console.log(`${BLUE}Validating dungeon rooms...${RESET}`);
    validateDungeonRooms(dungeonRooms, wingsById).forEach(r => {
        if (r.type === 'error') results.errors.push(r.message);
        else results.warnings.push(r.message);
    });
    results.validated.push({ category: 'Dungeon Rooms', count: Object.keys(dungeonRooms).length });

    if (wings) {
        console.log(`${BLUE}Validating wings...${RESET}`);
        validateWings(wings, roomsById).forEach(r => {
            if (r.type === 'error') results.errors.push(r.message);
            else results.warnings.push(r.message);
        });
        results.validated.push({ category: 'Wings', count: Object.keys(wings).length });
    }

    if (curses) {
        console.log(`${BLUE}Validating curses...${RESET}`);
        validateCurses(curses).forEach(r => {
            if (r.type === 'error') results.errors.push(r.message);
            else results.warnings.push(r.message);
        });
        results.validated.push({ category: 'Curses', count: Object.keys(curses).length });
    }

    if (abilities) {
        console.log(`${BLUE}Validating abilities...${RESET}`);
        validateAbilities(abilities).forEach(r => {
            if (r.type === 'error') results.errors.push(r.message);
            else results.warnings.push(r.message);
        });
        results.validated.push({ category: 'Abilities', count: Object.keys(abilities).length });
    }

    if (atmosphericBuffs) {
        console.log(`${BLUE}Validating atmospheric buffs...${RESET}`);
        validateBuffs(atmosphericBuffs, 'Atmospheric Buff').forEach(r => {
            if (r.type === 'error') results.errors.push(r.message);
            else results.warnings.push(r.message);
        });
        results.validated.push({ category: 'Atmospheric Buffs', count: Object.keys(atmosphericBuffs).length });
    }

    if (temporaryBuffs) {
        console.log(`${BLUE}Validating temporary buffs...${RESET}`);
        validateBuffs(temporaryBuffs, 'Temporary Buff').forEach(r => {
            if (r.type === 'error') results.errors.push(r.message);
            else results.warnings.push(r.message);
        });
        results.validated.push({ category: 'Temporary Buffs', count: Object.keys(temporaryBuffs).length });
    }

    if (temporaryBuffsFromRewards) {
        console.log(`${BLUE}Validating temporary buffs from rewards...${RESET}`);
        validateBuffs(temporaryBuffsFromRewards, 'Temporary Buff from Reward').forEach(r => {
            if (r.type === 'error') results.errors.push(r.message);
            else results.warnings.push(r.message);
        });
        results.validated.push({ category: 'Temporary Buffs from Rewards', count: Object.keys(temporaryBuffsFromRewards).length });
    }

    if (restorationProjects) {
        console.log(`${BLUE}Validating restoration projects...${RESET}`);
        validateRestorationProjects(restorationProjects, wingsById).forEach(r => {
            if (r.type === 'error') results.errors.push(r.message);
            else results.warnings.push(r.message);
        });
        results.validated.push({ category: 'Restoration Projects', count: Object.keys(restorationProjects).length });
    }

    console.log(`${BLUE}Validating expansions manifest...${RESET}`);
    validateExpansions(expansions).forEach(r => {
        if (r.type === 'error') results.errors.push(r.message);
        else results.warnings.push(r.message);
    });
    results.validated.push({ category: 'Expansions', count: Object.keys(expansions.expansions || {}).length + 1 });

    // Print results
    console.log(`\n${BLUE}=== Validation Results ===${RESET}\n`);

    // Validated counts
    for (const item of results.validated) {
        console.log(`${GREEN}✓${RESET} ${item.category}: ${item.count} entries validated`);
    }

    // Warnings
    if (results.warnings.length > 0) {
        console.log(`\n${YELLOW}Warnings (${results.warnings.length}):${RESET}`);
        results.warnings.forEach(w => console.log(`  ${YELLOW}⚠${RESET} ${w}`));
    }

    // Errors
    if (results.errors.length > 0) {
        console.log(`\n${RED}Errors (${results.errors.length}):${RESET}`);
        results.errors.forEach(e => console.log(`  ${RED}✗${RESET} ${e}`));
    }

    // Summary
    console.log(`\n${BLUE}=== Summary ===${RESET}`);
    console.log(`Validated: ${results.validated.length} categories`);
    console.log(`${YELLOW}Warnings: ${results.warnings.length}${RESET}`);
    console.log(`${results.errors.length > 0 ? RED : GREEN}Errors: ${results.errors.length}${RESET}\n`);

    return results.errors.length === 0;
}

// Run validation
const success = validateAll();
process.exit(success ? 0 : 1);

