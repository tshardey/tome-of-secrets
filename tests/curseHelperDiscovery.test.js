/**
 * @jest-environment jsdom
 */

import {
    isWornPageMitigation,
    getCadenceFromText,
    buildSourceId,
    buildCurseHelperList,
    findHelperForPipelineSource,
    findHelperSourceIdForPipelineSource
} from '../assets/js/character-sheet/curseHelperDiscovery.js';
import { STORAGE_KEYS } from '../assets/js/character-sheet/storageKeys.js';

describe('curseHelperDiscovery', () => {
    describe('isWornPageMitigation', () => {
        it('returns true for "remove a Worn Page penalty"', () => {
            expect(isWornPageMitigation('Once per month, remove a Worn Page penalty.')).toBe(true);
        });

        it('returns true for "remove one Worn Page penalty"', () => {
            expect(isWornPageMitigation('remove one Worn Page penalty.')).toBe(true);
        });

        it('returns true for "negate it" (negate Worn Page penalty)', () => {
            expect(isWornPageMitigation('When you would gain a Worn Page penalty, you may choose to completely negate it.')).toBe(true);
        });

        it('returns true for "immune to Worn Page penalties"', () => {
            expect(isWornPageMitigation('You are immune to Worn Page penalties.')).toBe(true);
        });

        it('returns false when text contains "Worn Page" but not a mitigation phrase', () => {
            expect(isWornPageMitigation('You gain a Worn Page curse.')).toBe(false);
            expect(isWornPageMitigation('Worn Page penalty applies.')).toBe(false);
        });

        it('returns false for empty or null input', () => {
            expect(isWornPageMitigation('')).toBe(false);
            expect(isWornPageMitigation(null)).toBe(false);
            expect(isWornPageMitigation(undefined)).toBe(false);
        });

        it('returns false for non-string input', () => {
            expect(isWornPageMitigation(123)).toBe(false);
        });
    });

    describe('getCadenceFromText', () => {
        it('returns "monthly" for "once per month"', () => {
            expect(getCadenceFromText('Once per month, remove a Worn Page penalty.')).toBe('monthly');
        });

        it('returns "every-2-months" for "once every 2 months"', () => {
            expect(getCadenceFromText('Once every 2 months you may remove a Worn Page penalty.')).toBe('every-2-months');
        });

        it('returns "every-2-months" for "every 2 months"', () => {
            expect(getCadenceFromText('Every 2 months, negate it.')).toBe('every-2-months');
        });

        it('returns "one-time" when no cadence phrase', () => {
            expect(getCadenceFromText('Remove one Worn Page penalty.')).toBe('one-time');
        });

        it('returns "one-time" for empty or null', () => {
            expect(getCadenceFromText('')).toBe('one-time');
            expect(getCadenceFromText(null)).toBe('one-time');
        });
    });

    describe('buildSourceId', () => {
        it('includes sourceType and identifier when no slotMode', () => {
            expect(buildSourceId('ability', null, 'Ward Against the Shroud')).toBe('ability:Ward Against the Shroud');
        });

        it('includes slotMode when provided', () => {
            expect(buildSourceId('item', 'equipped', '0|Chalice')).toBe('item:equipped:0_Chalice');
        });

        it('sanitizes | and : in identifier to underscore', () => {
            expect(buildSourceId('tempBuff', null, '0|Buff:Name')).toBe('tempBuff:0_Buff_Name');
        });

        it('handles empty identifier', () => {
            expect(buildSourceId('school', null, '')).toBe('school:');
        });
    });

    describe('buildCurseHelperList', () => {
        const baseCatalogs = {
            allItems: {},
            temporaryBuffs: {},
            masteryAbilities: {},
            schoolBenefits: {},
            seriesExpedition: { stops: [] }
        };

        it('discovers equipped item with Worn Page mitigation bonus', () => {
            const state = {
                [STORAGE_KEYS.EQUIPPED_ITEMS]: [{ name: 'Chalice of Restoration' }],
                [STORAGE_KEYS.INVENTORY_ITEMS]: [],
                [STORAGE_KEYS.PASSIVE_ITEM_SLOTS]: [],
                [STORAGE_KEYS.PASSIVE_FAMILIAR_SLOTS]: [],
                [STORAGE_KEYS.TEMPORARY_BUFFS]: [],
                [STORAGE_KEYS.LEARNED_ABILITIES]: [],
                [STORAGE_KEYS.SERIES_EXPEDITION_PROGRESS]: []
            };
            const catalogs = {
                ...baseCatalogs,
                allItems: {
                    'Chalice of Restoration': {
                        name: 'Chalice of Restoration',
                        bonus: 'Once per month, you may use this item to remove a Worn Page penalty.',
                        img: 'assets/images/rewards/chalice.png'
                    }
                }
            };
            const helpers = buildCurseHelperList(state, catalogs, {});
            expect(helpers).toHaveLength(1);
            expect(helpers[0].sourceType).toBe('item');
            expect(helpers[0].slotMode).toBe('equipped');
            expect(helpers[0].name).toBe('Chalice of Restoration');
            expect(helpers[0].cadence).toBe('monthly');
            expect(helpers[0].sourceId).toMatch(/^item:equipped:/);
            expect(helpers[0].img).toBe('assets/images/rewards/chalice.png');
        });

        it('discovers inventory item with Worn Page mitigation', () => {
            const state = {
                [STORAGE_KEYS.EQUIPPED_ITEMS]: [],
                [STORAGE_KEYS.INVENTORY_ITEMS]: [{ name: 'Spellbook' }],
                [STORAGE_KEYS.PASSIVE_ITEM_SLOTS]: [],
                [STORAGE_KEYS.PASSIVE_FAMILIAR_SLOTS]: [],
                [STORAGE_KEYS.TEMPORARY_BUFFS]: [],
                [STORAGE_KEYS.LEARNED_ABILITIES]: [],
                [STORAGE_KEYS.SERIES_EXPEDITION_PROGRESS]: []
            };
            const catalogs = {
                ...baseCatalogs,
                allItems: {
                    Spellbook: {
                        name: 'Spellbook',
                        bonus: 'remove one Worn Page penalty.'
                    }
                }
            };
            const helpers = buildCurseHelperList(state, catalogs, {});
            expect(helpers).toHaveLength(1);
            expect(helpers[0].sourceType).toBe('item');
            expect(helpers[0].slotMode).toBe('inventory');
            expect(helpers[0].sourceId).toMatch(/^item:inventory:/);
        });

        it('discovers passive item slot with passiveBonus mitigation', () => {
            const state = {
                [STORAGE_KEYS.EQUIPPED_ITEMS]: [],
                [STORAGE_KEYS.INVENTORY_ITEMS]: [],
                [STORAGE_KEYS.PASSIVE_ITEM_SLOTS]: [{ slotId: 'slot1', itemName: 'Talisman' }],
                [STORAGE_KEYS.PASSIVE_FAMILIAR_SLOTS]: [],
                [STORAGE_KEYS.TEMPORARY_BUFFS]: [],
                [STORAGE_KEYS.LEARNED_ABILITIES]: [],
                [STORAGE_KEYS.SERIES_EXPEDITION_PROGRESS]: []
            };
            const catalogs = {
                ...baseCatalogs,
                allItems: {
                    Talisman: {
                        name: 'Talisman',
                        passiveBonus: 'Once per month, remove a Worn Page penalty.',
                        img: 'assets/images/rewards/talisman.png'
                    }
                }
            };
            const helpers = buildCurseHelperList(state, catalogs, {});
            expect(helpers).toHaveLength(1);
            expect(helpers[0].sourceType).toBe('item');
            expect(helpers[0].slotMode).toBe('passiveItem');
            expect(helpers[0].name).toBe('Talisman');
            expect(helpers[0].sourceId).toMatch(/^item:passiveItem:/);
            expect(helpers[0].img).toBe('assets/images/rewards/talisman.png');
        });

        it('discovers passive familiar slot with passiveBonus mitigation', () => {
            const state = {
                [STORAGE_KEYS.EQUIPPED_ITEMS]: [],
                [STORAGE_KEYS.INVENTORY_ITEMS]: [],
                [STORAGE_KEYS.PASSIVE_ITEM_SLOTS]: [],
                [STORAGE_KEYS.PASSIVE_FAMILIAR_SLOTS]: [{ slotId: 'fam1', itemName: 'Familiar' }],
                [STORAGE_KEYS.TEMPORARY_BUFFS]: [],
                [STORAGE_KEYS.LEARNED_ABILITIES]: [],
                [STORAGE_KEYS.SERIES_EXPEDITION_PROGRESS]: []
            };
            const catalogs = {
                ...baseCatalogs,
                allItems: {
                    Familiar: {
                        name: 'Familiar',
                        passiveBonus: 'immune to Worn Page penalties.'
                    }
                }
            };
            const helpers = buildCurseHelperList(state, catalogs, {});
            expect(helpers).toHaveLength(1);
            expect(helpers[0].slotMode).toBe('passiveFamiliar');
            expect(helpers[0].sourceId).toMatch(/^item:passiveFamiliar:/);
        });

        it('discovers temporary buff with Worn Page mitigation description', () => {
            const state = {
                [STORAGE_KEYS.EQUIPPED_ITEMS]: [],
                [STORAGE_KEYS.INVENTORY_ITEMS]: [],
                [STORAGE_KEYS.PASSIVE_ITEM_SLOTS]: [],
                [STORAGE_KEYS.PASSIVE_FAMILIAR_SLOTS]: [],
                [STORAGE_KEYS.TEMPORARY_BUFFS]: [{ name: 'Blessing' }],
                [STORAGE_KEYS.LEARNED_ABILITIES]: [],
                [STORAGE_KEYS.SERIES_EXPEDITION_PROGRESS]: []
            };
            const catalogs = {
                ...baseCatalogs,
                temporaryBuffs: {
                    Blessing: {
                        name: 'Blessing',
                        description: 'Once per month, remove one Worn Page penalty.'
                    }
                }
            };
            const helpers = buildCurseHelperList(state, catalogs, {});
            expect(helpers).toHaveLength(1);
            expect(helpers[0].sourceType).toBe('tempBuff');
            expect(helpers[0].name).toBe('Blessing');
            expect(helpers[0].sourceId).toMatch(/^tempBuff:/);
        });

        it('discovers learned mastery ability with Worn Page mitigation benefit', () => {
            const state = {
                [STORAGE_KEYS.EQUIPPED_ITEMS]: [],
                [STORAGE_KEYS.INVENTORY_ITEMS]: [],
                [STORAGE_KEYS.PASSIVE_ITEM_SLOTS]: [],
                [STORAGE_KEYS.PASSIVE_FAMILIAR_SLOTS]: [],
                [STORAGE_KEYS.TEMPORARY_BUFFS]: [],
                [STORAGE_KEYS.LEARNED_ABILITIES]: ['Ward Against the Shroud'],
                [STORAGE_KEYS.SERIES_EXPEDITION_PROGRESS]: []
            };
            const catalogs = {
                ...baseCatalogs,
                masteryAbilities: {
                    'Ward Against the Shroud': {
                        name: 'Ward Against the Shroud',
                        benefit: 'Once per month, when you would gain a Worn Page penalty for an uncompleted quest, you may choose to completely negate it.'
                    }
                }
            };
            const helpers = buildCurseHelperList(state, catalogs, {});
            expect(helpers).toHaveLength(1);
            expect(helpers[0].sourceType).toBe('ability');
            expect(helpers[0].name).toBe('Ward Against the Shroud');
            expect(helpers[0].sourceId).toBe('ability:Ward Against the Shroud');
        });

        it('discovers school passive when school option provided', () => {
            const state = {
                [STORAGE_KEYS.EQUIPPED_ITEMS]: [],
                [STORAGE_KEYS.INVENTORY_ITEMS]: [],
                [STORAGE_KEYS.PASSIVE_ITEM_SLOTS]: [],
                [STORAGE_KEYS.PASSIVE_FAMILIAR_SLOTS]: [],
                [STORAGE_KEYS.TEMPORARY_BUFFS]: [],
                [STORAGE_KEYS.LEARNED_ABILITIES]: [],
                [STORAGE_KEYS.SERIES_EXPEDITION_PROGRESS]: []
            };
            const catalogs = {
                ...baseCatalogs,
                schoolBenefits: {
                    Abjuration: {
                        benefit: 'Once per month, when you would gain a Worn Page penalty, you may instead draw a card from the deck.'
                    }
                }
            };
            const helpers = buildCurseHelperList(state, catalogs, { school: 'Abjuration' });
            expect(helpers).toHaveLength(1);
            expect(helpers[0].sourceType).toBe('school');
            expect(helpers[0].name).toBe('Abjuration');
            expect(helpers[0].sourceId).toBe('school:Abjuration');
        });

        it('does not include school when school option not provided', () => {
            const catalogs = {
                ...baseCatalogs,
                schoolBenefits: {
                    Abjuration: { benefit: 'Once per month, remove a Worn Page penalty.' }
                }
            };
            const helpers = buildCurseHelperList({}, catalogs, {});
            expect(helpers).toHaveLength(0);
        });

        it('discovers series expedition stop with passive-rule-modifier and mitigation text', () => {
            const state = {
                [STORAGE_KEYS.EQUIPPED_ITEMS]: [],
                [STORAGE_KEYS.INVENTORY_ITEMS]: [],
                [STORAGE_KEYS.PASSIVE_ITEM_SLOTS]: [],
                [STORAGE_KEYS.PASSIVE_FAMILIAR_SLOTS]: [],
                [STORAGE_KEYS.TEMPORARY_BUFFS]: [],
                [STORAGE_KEYS.LEARNED_ABILITIES]: [],
                [STORAGE_KEYS.SERIES_EXPEDITION_PROGRESS]: [{ seriesId: 's1', stopId: 'stop-1', claimedAt: '2025-01' }]
            };
            const catalogs = {
                ...baseCatalogs,
                seriesExpedition: {
                    stops: [
                        {
                            id: 'stop-1',
                            name: 'First Stop',
                            reward: { type: 'passive-rule-modifier', text: 'Once per month, remove a Worn Page penalty.' }
                        }
                    ]
                }
            };
            const helpers = buildCurseHelperList(state, catalogs, {});
            expect(helpers).toHaveLength(1);
            expect(helpers[0].sourceType).toBe('seriesExpedition');
            expect(helpers[0].name).toBe('First Stop');
            expect(helpers[0].sourceId).toMatch(/^seriesExpedition:/);
        });

        it('assigns separate sourceIds per source instance (same item in equipped vs inventory)', () => {
            const state = {
                [STORAGE_KEYS.EQUIPPED_ITEMS]: [{ name: 'Chalice' }],
                [STORAGE_KEYS.INVENTORY_ITEMS]: [{ name: 'Chalice' }],
                [STORAGE_KEYS.PASSIVE_ITEM_SLOTS]: [],
                [STORAGE_KEYS.PASSIVE_FAMILIAR_SLOTS]: [],
                [STORAGE_KEYS.TEMPORARY_BUFFS]: [],
                [STORAGE_KEYS.LEARNED_ABILITIES]: [],
                [STORAGE_KEYS.SERIES_EXPEDITION_PROGRESS]: []
            };
            const catalogs = {
                ...baseCatalogs,
                allItems: {
                    Chalice: { name: 'Chalice', bonus: 'Once per month, remove a Worn Page penalty.' }
                }
            };
            const helpers = buildCurseHelperList(state, catalogs, {});
            expect(helpers).toHaveLength(2);
            const ids = helpers.map(h => h.sourceId);
            expect(new Set(ids).size).toBe(2);
            expect(helpers.some(h => h.slotMode === 'equipped')).toBe(true);
            expect(helpers.some(h => h.slotMode === 'inventory')).toBe(true);
        });

        it('returns empty array when no sources have mitigation', () => {
            const state = {
                [STORAGE_KEYS.EQUIPPED_ITEMS]: [{ name: 'Sword' }],
                [STORAGE_KEYS.INVENTORY_ITEMS]: [],
                [STORAGE_KEYS.PASSIVE_ITEM_SLOTS]: [],
                [STORAGE_KEYS.PASSIVE_FAMILIAR_SLOTS]: [],
                [STORAGE_KEYS.TEMPORARY_BUFFS]: [],
                [STORAGE_KEYS.LEARNED_ABILITIES]: [],
                [STORAGE_KEYS.SERIES_EXPEDITION_PROGRESS]: []
            };
            const catalogs = {
                ...baseCatalogs,
                allItems: { Sword: { name: 'Sword', bonus: '+1 attack.' } }
            };
            const helpers = buildCurseHelperList(state, catalogs, {});
            expect(helpers).toEqual([]);
        });
    });

    describe('findHelperForPipelineSource', () => {
        const baseCatalogs = {
            allItems: {},
            temporaryBuffs: {},
            masteryAbilities: {},
            schoolBenefits: {
                Abjuration: {
                    benefit:
                        'Once per month, when you would gain a Worn Page penalty, you may instead draw a card from the deck and choose a quest from that draw to complete.'
                }
            },
            seriesExpedition: {}
        };

        it('matches school pipeline source (School of X name) to school helper', () => {
            const state = {
                [STORAGE_KEYS.EQUIPPED_ITEMS]: [],
                [STORAGE_KEYS.INVENTORY_ITEMS]: [],
                [STORAGE_KEYS.PASSIVE_ITEM_SLOTS]: [],
                [STORAGE_KEYS.PASSIVE_FAMILIAR_SLOTS]: [],
                [STORAGE_KEYS.TEMPORARY_BUFFS]: [],
                [STORAGE_KEYS.LEARNED_ABILITIES]: [],
                [STORAGE_KEYS.SERIES_EXPEDITION_PROGRESS]: []
            };
            const h = findHelperForPipelineSource(
                state,
                baseCatalogs,
                { school: 'Abjuration' },
                { sourceType: 'school', id: 'Abjuration', name: 'School of Abjuration' }
            );
            expect(h).not.toBeNull();
            expect(h.sourceId).toBe(buildSourceId('school', null, 'Abjuration'));
            expect(h.sourceType).toBe('school');
        });

        it('matches equipped item pipeline source to item helper', () => {
            const state = {
                [STORAGE_KEYS.EQUIPPED_ITEMS]: [{ name: 'Chalice of Restoration' }],
                [STORAGE_KEYS.INVENTORY_ITEMS]: [],
                [STORAGE_KEYS.PASSIVE_ITEM_SLOTS]: [],
                [STORAGE_KEYS.PASSIVE_FAMILIAR_SLOTS]: [],
                [STORAGE_KEYS.TEMPORARY_BUFFS]: [],
                [STORAGE_KEYS.LEARNED_ABILITIES]: [],
                [STORAGE_KEYS.SERIES_EXPEDITION_PROGRESS]: []
            };
            const catalogs = {
                ...baseCatalogs,
                allItems: {
                    'Chalice of Restoration': {
                        name: 'Chalice of Restoration',
                        bonus: 'Once per month, you may use this item to remove a Worn Page penalty.'
                    }
                }
            };
            const h = findHelperForPipelineSource(
                state,
                catalogs,
                {},
                {
                    sourceType: 'item',
                    id: 'chalice-of-restoration',
                    name: 'Chalice of Restoration'
                }
            );
            expect(h).not.toBeNull();
            expect(h.sourceId).toBe(buildSourceId('item', 'equipped', '0|Chalice of Restoration'));
        });

        it('findHelperSourceIdForPipelineSource returns only sourceId string', () => {
            const state = {
                [STORAGE_KEYS.EQUIPPED_ITEMS]: [],
                [STORAGE_KEYS.INVENTORY_ITEMS]: [],
                [STORAGE_KEYS.PASSIVE_ITEM_SLOTS]: [],
                [STORAGE_KEYS.PASSIVE_FAMILIAR_SLOTS]: [],
                [STORAGE_KEYS.TEMPORARY_BUFFS]: [],
                [STORAGE_KEYS.LEARNED_ABILITIES]: [],
                [STORAGE_KEYS.SERIES_EXPEDITION_PROGRESS]: []
            };
            const id = findHelperSourceIdForPipelineSource(
                state,
                baseCatalogs,
                { school: 'Abjuration' },
                { sourceType: 'school', id: 'Abjuration', name: 'School of Abjuration' }
            );
            expect(id).toBe(buildSourceId('school', null, 'Abjuration'));
        });
    });
});
