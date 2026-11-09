import {
    buildSourceId,
    getCadenceFromText,
    validateHelperState
} from '../assets/js/character-sheet/helperDiscoveryShared.js';

describe('helperDiscoveryShared', () => {
    describe('buildSourceId', () => {
        it('joins source type, slot mode and identifier', () => {
            expect(buildSourceId('item', 'equipped', '0|Lantern')).toBe('item:equipped:0_Lantern');
        });

        it('omits a missing slot mode and escapes ":" and "|" in the identifier', () => {
            expect(buildSourceId('ability', null, 'A:B|C')).toBe('ability:A_B_C');
            expect(buildSourceId('school', undefined, undefined)).toBe('school:');
        });
    });

    describe('getCadenceFromText', () => {
        it.each([
            ['Once per month, roll 2 dice.', 'monthly'],
            ['Once every 2 months, draw again.', 'every-2-months'],
            ['Draw two additional cards.', 'one-time'],
            ['', 'one-time'],
            [null, 'one-time']
        ])('%p -> %p', (text, expected) => {
            expect(getCadenceFromText(text)).toBe(expected);
        });
    });

    describe('validateHelperState', () => {
        it('returns {} for non-object input', () => {
            expect(validateHelperState(null)).toEqual({});
            expect(validateHelperState([])).toEqual({});
            expect(validateHelperState('x')).toEqual({});
        });

        it('keeps valid entries, trims keys, and drops bad keys/entries', () => {
            const result = validateHelperState({
                ' school:Divination ': { used: true, cooldownCyclesRemaining: 1.7 },
                '   ': { used: true },
                'item:equipped:0_X': 'not-an-object',
                'ability:Y': { used: 'yes', cooldownCyclesRemaining: -1 },
                'ability:Z': { cooldownCyclesRemaining: NaN }
            });
            expect(result).toEqual({
                'school:Divination': { used: true, cooldownCyclesRemaining: 1 },
                'ability:Y': { used: false },
                'ability:Z': { used: false }
            });
        });
    });
});
