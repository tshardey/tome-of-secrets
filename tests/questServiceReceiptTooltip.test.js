import { formatReceiptTooltip, isRetiredCurrencyReceiptLine } from '../assets/js/services/QuestService.js';

describe('formatReceiptTooltip with legacy (pre-v18) receipts', () => {
    const legacyReceipt = {
        base: { xp: 15, inkDrops: 10, paperScraps: 0, blueprints: 15 },
        modifiers: [
            { source: "Librarian's Compass", type: 'item', value: 20, description: '+20 inkDrops', currency: 'inkDrops' },
            { source: 'Tome-Bound Cat', type: 'item', value: 10, description: 'x2 inkDrops (+10)', currency: null },
            { source: 'Silver Tongue', type: 'ability', value: 5, description: '+5 Paper Scraps', currency: 'paperScraps' },
            { source: 'Alchemic Focus', type: 'ability', value: 5, description: '+5 xp', currency: 'xp' }
        ],
        final: { xp: 20, inkDrops: 40, paperScraps: 5, blueprints: 15 }
    };

    it('hides Ink and Paper lines and keeps XP and blueprint lines', () => {
        const text = formatReceiptTooltip(legacyReceipt, 'completed');

        expect(text).not.toMatch(/ink|paper/i);
        expect(text).not.toMatch(/undefined|NaN/);
        expect(text).toContain('Alchemic Focus: +5 xp');
        expect(text).toContain('Base: 15 XP, 15 Blueprints');
        expect(text).toContain('Final: 20 XP, 15 Blueprints');
    });

    it('omits the Modifiers heading when every line was retired currency', () => {
        const text = formatReceiptTooltip({
            base: { xp: 15 },
            modifiers: [{ source: 'Cloak', description: '+10 inkDrops', currency: 'inkDrops' }],
            final: { xp: 15 }
        }, 'completed');

        expect(text).not.toContain('Modifiers:');
    });

    it('keeps dollar lines', () => {
        expect(isRetiredCurrencyReceiptLine({ description: '+$4', currency: 'dollars' })).toBe(false);
        expect(isRetiredCurrencyReceiptLine({ description: '+10 Ink Drops', currency: null })).toBe(true);
    });
});
