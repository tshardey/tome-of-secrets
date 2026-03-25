/**
 * Tests for PermanentEffectCapabilities — typed permanent effect resolution (tome-of-secrets-osm.1)
 */

import {
    DISPOSITION,
    MASTERY_ABILITY_ID,
    resolvePermanentEffectCapabilities,
    resolvePermanentEffectCapabilitiesFromAdapter,
    learnedAbilityNamesToIds,
    getReachedExpeditionStops
} from '../assets/js/services/PermanentEffectCapabilities.js';

describe('learnedAbilityNamesToIds', () => {
    test('maps known ability names to catalog ids', () => {
        const ids = learnedAbilityNamesToIds(['Silver Tongue', 'Echo Chamber']);
        expect(ids.has(MASTERY_ABILITY_ID.SILVER_TONGUE)).toBe(true);
        expect(ids.has(MASTERY_ABILITY_ID.ECHO_CHAMBER)).toBe(true);
        expect(ids.size).toBe(2);
    });

    test('ignores unknown names', () => {
        expect(learnedAbilityNamesToIds(['Not A Real Ability']).size).toBe(0);
    });
});

describe('getReachedExpeditionStops', () => {
    test('returns first N stops by expedition order for N advances', () => {
        const stops = getReachedExpeditionStops([{}, {}, {}]);
        expect(stops.length).toBe(3);
        expect(stops[0].id).toBe('stop-1');
        expect(stops[2].id).toBe('stop-3');
    });

    test('returns empty for no progress', () => {
        expect(getReachedExpeditionStops([])).toEqual([]);
    });
});

describe('resolvePermanentEffectCapabilities', () => {
    test('exposes level gates and dispositions', () => {
        const low = resolvePermanentEffectCapabilities({ level: 2 });
        expect(low.flags.level.novicesFocusUnlocked).toBe(false);
        expect(low.rewardModifiers.longBookCompletionBonusXp).toBe(0);
        expect(low.dispositions['level.novices_focus']).toBe(DISPOSITION.AUTO_APPLY);

        const high = resolvePermanentEffectCapabilities({ level: 6 });
        expect(high.flags.level.novicesFocusUnlocked).toBe(true);
        expect(high.rewardModifiers.longBookCompletionBonusXp).toBe(5);
        expect(high.flags.level.focusedAtmosphereUnlocked).toBe(false);

        const seven = resolvePermanentEffectCapabilities({ level: 7 });
        expect(seven.rewardModifiers.atmosphericPositiveInkDropBonusAdd).toBe(1);
    });

    test('sets school-only modifiers when Conjuration is selected', () => {
        const none = resolvePermanentEffectCapabilities({ level: 10, school: 'Evocation' });
        expect(none.rewardModifiers.questCompletionFamiliarEquippedInkBonus).toBe(0);
        expect(none.flags.school.conjurationFamiliarInkBonusActive).toBe(false);

        const conj = resolvePermanentEffectCapabilities({ level: 10, school: 'Conjuration' });
        expect(conj.rewardModifiers.questCompletionFamiliarEquippedInkBonus).toBe(5);
        expect(conj.flags.school.conjurationFamiliarInkBonusActive).toBe(true);
        expect(conj.dispositions['school.conjuration.familiar_slot_quest_ink']).toBe(DISPOSITION.AUTO_APPLY);
    });

    test('marks Enchantment befriended multiplier as applied_in_codepath', () => {
        const enc = resolvePermanentEffectCapabilities({ level: 5, school: 'Enchantment' });
        expect(enc.flags.school.enchantmentBefriendXpMultiplierActive).toBe(true);
        expect(enc.dispositions['school.enchantment.befriend_xp_multiplier']).toBe(DISPOSITION.APPLIED_IN_CODEPATH);
    });

    test('applies mastery numeric modifiers and slot flags', () => {
        const cap = resolvePermanentEffectCapabilities({
            level: 10,
            learnedAbilities: ['Silver Tongue', 'Empowered Bond', "Echo Chamber"]
        });
        expect(cap.rewardModifiers.sideQuestPaperScrapsBonus).toBe(5);
        expect(cap.rewardModifiers.familiarRewardFlatBonus).toBe(5);
        expect(cap.slotModifiers.extraFamiliarSlotsFromEchoChamber).toBe(1);
        expect(cap.flags.mastery.silverTongue).toBe(true);
        expect(cap.dispositions['mastery.echo_chamber']).toBe(DISPOSITION.AUTO_APPLY);
    });

    test('expedition stop 2/5/7/8/10 update modifiers and helper flags', () => {
        const progress = Array.from({ length: 10 }, () => ({
            seriesId: 's1',
            stopId: 'x',
            claimedAt: '2026-01-01'
        }));
        const cap = resolvePermanentEffectCapabilities({
            level: 1,
            seriesExpeditionProgress: progress
        });
        expect(cap.rewardModifiers.organizeTheStacksBaseXp).toBe(20);
        expect(cap.rewardModifiers.adventureJournalPaperScraps).toBe(10);
        expect(cap.rewardModifiers.seriesBookInkDropsPerBook).toBe(15);
        expect(cap.rewardModifiers.dungeonRoomXpPerRoomAdd).toBe(10);
        expect(cap.flags.expedition.hasShroudMitigationOncePerMonth).toBe(true);
        expect(cap.flags.helpers.canIgnoreOneShroudOrSpoonPerMonth).toBe(true);
        expect(cap.dispositions['expedition.stop_8.shroud_or_spoon_ignore']).toBe(DISPOSITION.HELPER_MANUAL);
    });

    test('defaults level to 1 when missing or invalid', () => {
        const cap = resolvePermanentEffectCapabilities({});
        expect(cap.inputs.level).toBe(1);
    });
});

describe('resolvePermanentEffectCapabilitiesFromAdapter', () => {
    test('pulls learned abilities and expedition progress from adapter', () => {
        const adapter = {
            getLearnedAbilities: () => ['Silver Tongue'],
            // Two advances: first stop is currency, second is Organize the Stacks passive
            getSeriesExpeditionProgress: () => [
                { seriesId: 'a', stopId: 'stop-1', claimedAt: 't1' },
                { seriesId: 'b', stopId: 'stop-2', claimedAt: 't2' }
            ]
        };
        const cap = resolvePermanentEffectCapabilitiesFromAdapter(adapter, { level: 8, school: null });
        expect(cap.inputs.learnedAbilityIds).toContain(MASTERY_ABILITY_ID.SILVER_TONGUE);
        expect(cap.inputs.expeditionAdvanceCount).toBe(2);
        expect(cap.rewardModifiers.organizeTheStacksBaseXp).toBe(20);
    });
});
