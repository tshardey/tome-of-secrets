import { findOverdrafts, formatOverdraftPrompt } from '../assets/js/services/ShoppingBalanceService.js';

describe('findOverdrafts', () => {
    test('returns empty when the player can afford the cost', () => {
        const result = findOverdrafts({ inkDrops: 100, paperScraps: 50 }, { inkDrops: 100, paperScraps: 25 });
        expect(result).toEqual([]);
    });

    test('reports the resulting negative balance for one resource', () => {
        const result = findOverdrafts({ inkDrops: 100, paperScraps: 5 }, { inkDrops: 25, paperScraps: 25 });
        expect(result).toEqual([{ resource: 'paperScraps', label: 'Paper Scraps', after: -20 }]);
    });

    test('reports both resources when both go negative', () => {
        const result = findOverdrafts({ inkDrops: 10, paperScraps: 5 }, { inkDrops: 25, paperScraps: 25 });
        expect(result).toEqual([
            { resource: 'inkDrops', label: 'Ink Drops', after: -15 },
            { resource: 'paperScraps', label: 'Paper Scraps', after: -20 }
        ]);
    });

    test('treats missing values as zero', () => {
        const result = findOverdrafts({}, { paperScraps: 5 });
        expect(result).toEqual([{ resource: 'paperScraps', label: 'Paper Scraps', after: -5 }]);
    });

    test('a balance that lands exactly on zero is not an overdraft', () => {
        expect(findOverdrafts({ inkDrops: 25 }, { inkDrops: 25 })).toEqual([]);
    });
});

describe('formatOverdraftPrompt', () => {
    test('names the single resulting balance', () => {
        const text = formatOverdraftPrompt([{ resource: 'paperScraps', label: 'Paper Scraps', after: -20 }]);
        expect(text).toBe('This will put you at -20 Paper Scraps. Log anyway?');
    });

    test('names both resulting balances', () => {
        const text = formatOverdraftPrompt([
            { resource: 'inkDrops', label: 'Ink Drops', after: -15 },
            { resource: 'paperScraps', label: 'Paper Scraps', after: -20 }
        ]);
        expect(text).toBe('This will put you at -15 Ink Drops and -20 Paper Scraps. Log anyway?');
    });

    test('returns empty string when there is nothing to warn about', () => {
        expect(formatOverdraftPrompt([])).toBe('');
    });
});
