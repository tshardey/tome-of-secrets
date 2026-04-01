import fs from 'node:fs';
import path from 'node:path';
import { MODIFIER_TYPES, TRIGGERS, validateEffect } from '../assets/js/services/effectSchema.js';
import { GAME_CONFIG } from '../assets/js/config/gameConfig.js';

function loadJson(filename) {
    const repoRoot = path.resolve(process.cwd(), '..');
    const fullPath = path.join(repoRoot, 'assets', 'data', filename);
    return JSON.parse(fs.readFileSync(fullPath, 'utf8'));
}

function expectString(value) {
    expect(typeof value).toBe('string');
    expect(value.trim().length).toBeGreaterThan(0);
}

function expectNonNegativeNumber(value) {
    expect(typeof value).toBe('number');
    expect(Number.isFinite(value)).toBe(true);
    expect(value).toBeGreaterThanOrEqual(0);
}

function expectRewardObject(rewards) {
    expect(rewards).toBeDefined();
    expectNonNegativeNumber(rewards.xp);
    expectNonNegativeNumber(rewards.inkDrops);
    expectNonNegativeNumber(rewards.paperScraps);
    expect(Array.isArray(rewards.items)).toBe(true);
}

function parseDisplayRewardValue(displayText, resourceLabel) {
    const escapedLabel = resourceLabel.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const match = displayText.match(new RegExp(`^\\+(\\d+)\\s+${escapedLabel}$`));
    if (!match) return null;
    return Number(match[1]);
}

describe('Data contracts for assets/data JSON catalogs', () => {
    const allItems = loadJson('allItems.json');
    const atmosphericBuffs = loadJson('atmosphericBuffs.json');
    const curseTableDetailed = loadJson('curseTableDetailed.json');
    const dungeonCompletionRewards = loadJson('dungeonCompletionRewards.json');
    const dungeonRewards = loadJson('dungeonRewards.json');
    const dungeonRooms = loadJson('dungeonRooms.json');
    const expansions = loadJson('expansions.json');
    const extraCreditRewards = loadJson('extraCreditRewards.json');
    const genreQuests = loadJson('genreQuests.json');
    const keeperBackgrounds = loadJson('keeperBackgrounds.json');
    const levelRewards = loadJson('levelRewards.json');
    const masteryAbilities = loadJson('masteryAbilities.json');
    const permanentBonuses = loadJson('permanentBonuses.json');
    const restorationProjects = loadJson('restorationProjects.json');
    const roomThemes = loadJson('roomThemes.json');
    const sanctumBenefits = loadJson('sanctumBenefits.json');
    const schoolBenefits = loadJson('schoolBenefits.json');
    const seriesCompletionRewards = loadJson('seriesCompletionRewards.json');
    const shoppingOptions = loadJson('shoppingOptions.json');
    const sideQuestsDetailed = loadJson('sideQuestsDetailed.json');
    const temporaryBuffs = loadJson('temporaryBuffs.json');
    const temporaryBuffsFromRewards = loadJson('temporaryBuffsFromRewards.json');
    const wings = loadJson('wings.json');
    const xpLevels = loadJson('xpLevels.json');

    test('allItems.json contract', () => {
        const ids = new Set();
        const validTypes = new Set(['Wearable', 'Non-Wearable', 'Familiar', 'Consumable', 'Quest']);
        Object.values(allItems).forEach((item) => {
            expectString(item.id);
            expect(ids.has(item.id)).toBe(false);
            ids.add(item.id);
            expectString(item.name);
            expect(validTypes.has(item.type)).toBe(true);
            expectString(item.img);
            expectString(item.bonus);
            if (Array.isArray(item.effects)) {
                item.effects.forEach((effect) => {
                    const validation = validateEffect(effect);
                    expect(validation.valid).toBe(true);
                });
            }
        });
    });

    test('keeperBackgrounds.json contract', () => {
        Object.entries(keeperBackgrounds).forEach(([key, background]) => {
            expectString(background.name);
            expectString(background.description);
            expectString(background.benefit);
            expect(Array.isArray(background.effects)).toBe(true);
            if (key === '') {
                expect(background.effects).toHaveLength(0);
            } else {
                expect(background.effects.length).toBeGreaterThan(0);
                background.effects.forEach((effect) => {
                    expect(validateEffect(effect).valid).toBe(true);
                });
            }
        });
    });

    test('schoolBenefits.json contract', () => {
        Object.values(schoolBenefits).forEach((school) => {
            expectString(school.description);
            expectString(school.benefit);
            expect(Array.isArray(school.effects)).toBe(true);
            expect(school.effects.length).toBeGreaterThan(0);
            school.effects.forEach((effect) => {
                expect(validateEffect(effect).valid).toBe(true);
            });
        });
    });

    test('masteryAbilities.json contract and ACTIVATE trigger rules', () => {
        const ids = new Set();
        Object.values(masteryAbilities).forEach((ability) => {
            expectString(ability.id);
            expect(ids.has(ability.id)).toBe(false);
            ids.add(ability.id);
            expectString(ability.name);
            expectString(ability.school);
            expectNonNegativeNumber(ability.cost);
            expectString(ability.benefit);
            expect(Array.isArray(ability.effects)).toBe(true);
            ability.effects.forEach((effect) => {
                expect(validateEffect(effect).valid).toBe(true);
                if (effect?.modifier?.type === MODIFIER_TYPES.ACTIVATE) {
                    expect(effect.trigger).not.toBe(TRIGGERS.ON_QUEST_COMPLETED);
                }
            });
        });
    });

    test('curseTableDetailed.json has unique contiguous numbers and required strings', () => {
        expect(Array.isArray(curseTableDetailed)).toBe(true);
        const numbers = curseTableDetailed.map(entry => entry.number).sort((a, b) => a - b);
        const uniqueNumbers = new Set(numbers);
        expect(uniqueNumbers.size).toBe(numbers.length);
        numbers.forEach((n, idx) => {
            expect(n).toBe(idx + 1);
        });
        curseTableDetailed.forEach((entry) => {
            expectString(entry.id);
            expectString(entry.name);
            expectString(entry.description);
        });
    });

    test('dungeonCompletionRewards.json covers rolls 1-20 with valid entries', () => {
        const keys = Object.keys(dungeonCompletionRewards).map(Number).sort((a, b) => a - b);
        expect(keys).toEqual(Array.from({ length: 20 }, (_, idx) => idx + 1));
        Object.values(dungeonCompletionRewards).forEach((entry) => {
            expectString(entry.name);
            expectString(entry.reward);
            if (entry.hasLink) {
                expect(entry.link).toBeDefined();
                expectString(entry.link.text);
                expectString(entry.link.url);
            }
        });
    });

    test('sideQuestsDetailed.json has stable id and reward fields', () => {
        const ids = new Set();
        Object.values(sideQuestsDetailed).forEach((quest) => {
            expectString(quest.id);
            expect(ids.has(quest.id)).toBe(false);
            ids.add(quest.id);
            expectString(quest.name);
            expectString(quest.description);
            expectString(quest.prompt);
            expectRewardObject(quest.rewards);
        });
    });

    test('wings.json references valid dungeon room keys', () => {
        const roomKeys = new Set(Object.keys(dungeonRooms));
        Object.values(wings).forEach((wing) => {
            expectString(wing.id);
            expectString(wing.name);
            expect(Array.isArray(wing.rooms)).toBe(true);
            expect(Array.isArray(wing.genres)).toBe(true);
            expect(wing.genres.length).toBeGreaterThan(0);
            expectString(wing.theme);
            wing.rooms.forEach((roomKey) => {
                expect(roomKeys.has(String(roomKey))).toBe(true);
            });
        });
    });

    test('atmosphericBuffs.json contract', () => {
        Object.values(atmosphericBuffs).forEach((buff) => {
            expectString(buff.id);
            expectString(buff.name);
            expectString(buff.stickerSlug);
            expectString(buff.description);
        });
    });

    test('xpLevels.json uses contiguous levels and monotonic values with level 20 Max', () => {
        const keys = Object.keys(xpLevels).map(Number).sort((a, b) => a - b);
        const expectedKeys = Array.from({ length: 20 }, (_, idx) => idx + 1);
        expect(keys).toEqual(expectedKeys);
        expect(xpLevels['20']).toBe('Max');
        for (let level = 1; level < 20; level += 1) {
            expectNonNegativeNumber(xpLevels[String(level)]);
            if (level > 1) {
                expect(xpLevels[String(level)]).toBeGreaterThan(xpLevels[String(level - 1)]);
            }
        }
    });

    test('levelRewards.json keys and non-negative reward values', () => {
        const keys = Object.keys(levelRewards).map(Number).sort((a, b) => a - b);
        expect(keys).toEqual(Array.from({ length: 20 }, (_, idx) => idx + 1));
        Object.values(levelRewards).forEach((reward) => {
            expectNonNegativeNumber(reward.inkDrops);
            expectNonNegativeNumber(reward.paperScraps);
            expectNonNegativeNumber(reward.smp);
            expectNonNegativeNumber(reward.inventorySlot);
        });
    });

    test('genreQuests.json has required fields, unique id, and blueprint reward numbers', () => {
        const ids = new Set();
        const blueprintById = new Map();
        Object.values(genreQuests).forEach((quest) => {
            expectString(quest.id);
            expect(ids.has(quest.id)).toBe(false);
            ids.add(quest.id);
            expectString(quest.genre);
            expectString(quest.description);
            expectRewardObject(quest.rewards);
            expectNonNegativeNumber(quest.blueprintReward);
            expect(blueprintById.has(quest.id)).toBe(false);
            blueprintById.set(quest.id, quest.blueprintReward);
        });
    });

    test('restorationProjects.json contract', () => {
        const itemRefs = new Set([
            ...Object.keys(allItems),
            ...Object.values(allItems).flatMap((item) => [item.id, item.name]).filter(Boolean)
        ]);
        const ids = new Set();
        Object.values(restorationProjects).forEach((project) => {
            expectString(project.id);
            expect(ids.has(project.id)).toBe(false);
            ids.add(project.id);
            expectString(project.wingId);
            expectString(project.name);
            expectNonNegativeNumber(project.cost);
            expectString(project.description);
            expectString(project.completionPrompt);
            expect(project.reward).toBeDefined();
            expectString(project.reward.type);
            if (Array.isArray(project.reward.suggestedItems)) {
                project.reward.suggestedItems.forEach((item) => {
                    expectString(item);
                    expect(itemRefs.has(item)).toBe(true);
                });
            }
        });
    });

    test('temporary buff catalogs have required fields', () => {
        [temporaryBuffs, temporaryBuffsFromRewards].forEach((catalog) => {
            Object.values(catalog).forEach((buff) => {
                expectString(buff.id);
                expectString(buff.name);
                expectString(buff.description);
                expectString(buff.duration);
                expectString(buff.source);
                expect(buff.rewardModifier).toBeDefined();
                expect(typeof buff.rewardModifier).toBe('object');
                expect(Array.isArray(buff.rewardModifier)).toBe(false);
            });
        });
    });

    test('shoppingOptions.json has unique ids and valid option shape', () => {
        const validTypes = new Set(['book-purchase', 'item', 'subscription-month', 'special-edition']);
        const ids = new Set();
        Object.values(shoppingOptions).forEach((option) => {
            expectString(option.id);
            expect(ids.has(option.id)).toBe(false);
            ids.add(option.id);
            expectString(option.label);
            expectString(option.description);
            expectNonNegativeNumber(option.inkDrops);
            expectNonNegativeNumber(option.paperScraps);
            expect(typeof option.allowQuantity).toBe('boolean');
            expect(validTypes.has(option.type)).toBe(true);
        });
    });

    test('roomThemes.json basic shape validation', () => {
        Object.values(roomThemes).forEach((theme) => {
            expectString(theme.id);
            expectString(theme.name);
            expectString(theme.baseImage);
            expect(theme.stickers).toBeDefined();
            expect(typeof theme.stickers).toBe('object');
            expect(Array.isArray(theme.stickers)).toBe(false);
            Object.values(theme.stickers).forEach((sticker) => {
                expectString(sticker.image);
                if (sticker.zIndex != null) {
                    expectNonNegativeNumber(sticker.zIndex);
                }
            });
        });
    });

    test('dungeonRooms.json basic shape validation', () => {
        Object.values(dungeonRooms).forEach((room) => {
            expectString(room.id);
            expectString(room.name);
            expectString(room.wingId);
            expectString(room.description);
            expectString(room.challenge);
            expectRewardObject(room.roomRewards);
            if (room.rollInstruction != null) {
                expectString(room.rollInstruction);
            }
            expect(Array.isArray(room.encountersDetailed)).toBe(true);
        });
    });

    test('dungeonRewards.json basic shape validation', () => {
        Object.values(dungeonRewards).forEach((entry) => {
            expectString(entry.reward);
            expectString(entry.penalty);
        });
    });

    test('extraCreditRewards.json is marked display-only and aligned to runtime config', () => {
        expectString(extraCreditRewards._note);
        expect(extraCreditRewards._note.toLowerCase()).toContain('display');
        expect(extraCreditRewards.rewards.xp).toBe(0);
        expect(extraCreditRewards.rewards.inkDrops).toBe(0);
        expect(extraCreditRewards.rewards.paperScraps).toBe(GAME_CONFIG.rewards.extraCredit.paperScraps);
        expect(extraCreditRewards.rewards.items).toEqual([]);
    });

    test('dungeonRewards.json display strings align with runtime-configured reward amounts', () => {
        expectString(dungeonRewards.bookCompletion._note);
        expectString(dungeonRewards.monster._note);
        expectString(dungeonRewards.friendlyCreature._note);
        expectString(dungeonRewards.familiar._note);

        expect(parseDisplayRewardValue(dungeonRewards.bookCompletion.reward, 'XP')).toBe(
            GAME_CONFIG.endOfMonth.bookCompletionXP
        );
        expect(parseDisplayRewardValue(dungeonRewards.monster.reward, 'XP')).toBe(
            GAME_CONFIG.rewards.encounter.monster.xp
        );
        expect(parseDisplayRewardValue(dungeonRewards.friendlyCreature.reward, 'Ink Drops')).toBe(
            GAME_CONFIG.rewards.encounter.friendlyCreature.inkDrops
        );
        expect(parseDisplayRewardValue(dungeonRewards.familiar.reward, 'Paper Scraps')).toBe(
            GAME_CONFIG.rewards.encounter.familiar.paperScraps
        );
    });

    test('genreQuests.json display rewards align with organize-the-stacks runtime config', () => {
        expectString(genreQuests['1']._note);
        Object.values(genreQuests).forEach((quest) => {
            expect(quest.rewards.xp).toBe(GAME_CONFIG.rewards.organizeTheStacks.xp);
            expect(quest.rewards.inkDrops).toBe(GAME_CONFIG.rewards.organizeTheStacks.inkDrops);
            expect(quest.rewards.paperScraps).toBe(0);
            expect(quest.rewards.items).toEqual([]);
        });
    });

    test('permanentBonuses.json basic shape validation', () => {
        Object.entries(permanentBonuses).forEach(([level, text]) => {
            expect(Number.isInteger(Number(level))).toBe(true);
            expectString(text);
        });
    });

    test('seriesCompletionRewards.json basic shape validation', () => {
        expectString(seriesCompletionRewards.id);
        expectString(seriesCompletionRewards.name);
        expectString(seriesCompletionRewards.mapName);
        expectString(seriesCompletionRewards.baseMapImage);
        expectString(seriesCompletionRewards.coordinateSystem);
        expect(Array.isArray(seriesCompletionRewards.stops)).toBe(true);
        seriesCompletionRewards.stops.forEach((stop) => {
            expectString(stop.id);
            expectNonNegativeNumber(stop.order);
            expectString(stop.name);
            expectString(stop.story);
            expect(stop.position).toBeDefined();
            expectNonNegativeNumber(stop.position.x);
            expectNonNegativeNumber(stop.position.y);
            expect(stop.reward).toBeDefined();
            expectString(stop.reward.type);
            expectString(stop.reward.text);
        });
    });

    test('expansions.json basic shape and data file references', () => {
        const allDataFiles = new Set(
            fs.readdirSync(path.join(path.resolve(process.cwd(), '..'), 'assets', 'data'))
                .filter(f => f.endsWith('.json'))
        );
        const core = expansions.core;
        expect(core).toBeDefined();
        expectString(core.version);
        expect(typeof core.enabled).toBe('boolean');
        expect(Array.isArray(core.features)).toBe(true);
        expect(Array.isArray(core.dataFiles)).toBe(true);
        core.dataFiles.forEach((file) => {
            expect(allDataFiles.has(file)).toBe(true);
        });

        const expansionEntries = expansions.expansions || {};
        Object.values(expansionEntries).forEach((entry) => {
            expectString(entry.version);
            expect(typeof entry.enabled).toBe('boolean');
            expect(Array.isArray(entry.requires)).toBe(true);
            expect(Array.isArray(entry.features)).toBe(true);
            expect(Array.isArray(entry.dataFiles)).toBe(true);
            entry.dataFiles.forEach((file) => {
                expect(allDataFiles.has(file)).toBe(true);
            });
        });
    });

    test('extraCreditRewards.json basic shape validation', () => {
        expectString(extraCreditRewards.description);
        expectRewardObject(extraCreditRewards.rewards);
    });

    test('sanctumBenefits.json basic shape validation', () => {
        const atmosphericBuffRefs = new Set([
            ...Object.keys(atmosphericBuffs),
            ...Object.values(atmosphericBuffs).flatMap((buff) => [buff.id, buff.name]).filter(Boolean)
        ]);
        Object.values(sanctumBenefits).forEach((benefit) => {
            expectString(benefit.id);
            expectString(benefit.name);
            expectString(benefit.description);
            expectString(benefit.benefit);
            expect(Array.isArray(benefit.associatedBuffs)).toBe(true);
            benefit.associatedBuffs.forEach((buffName) => {
                expectString(buffName);
                expect(atmosphericBuffRefs.has(buffName)).toBe(true);
            });
        });
    });

    test('atmosphericBuffs.json stickerSlug resolves in cozy-modern room theme', () => {
        const stickers = roomThemes['cozy-modern']?.stickers || {};
        const stickerSlugs = new Set(Object.keys(stickers));
        Object.values(atmosphericBuffs).forEach((buff) => {
            expectString(buff.stickerSlug);
            expect(stickerSlugs.has(buff.stickerSlug)).toBe(true);
        });
    });
});
