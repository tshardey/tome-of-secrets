import { buildFundLedgerViewModel } from '../../assets/js/viewModels/fundLedgerViewModel.js';

describe('buildFundLedgerViewModel', () => {
    test('labels months and formats amounts', () => {
        const vm = buildFundLedgerViewModel([
            { id: 'a', date: '2026-10-03', amountCents: 3200, note: '' },
            { id: 'b', date: '2026-11-01', amountCents: 1900, note: 'Legendarium purchase' },
            { id: 'c', date: '2026-11-07', amountCents: 500, note: '' }
        ]);

        expect(vm.map(g => g.monthKey)).toEqual(['2026-11', '2026-10']);
        expect(vm[0].label).toBe('November 2026');
        expect(vm[0].totalLabel).toBe('$24');
        expect(vm[0].entries).toEqual([
            { id: 'c', dateLabel: 'Nov 7', amountLabel: '$5', note: '' },
            { id: 'b', dateLabel: 'Nov 1', amountLabel: '$19', note: 'Legendarium purchase' }
        ]);
        expect(vm[1]).toEqual({
            monthKey: '2026-10',
            label: 'October 2026',
            totalLabel: '$32',
            entries: [{ id: 'a', dateLabel: 'Oct 3', amountLabel: '$32', note: '' }]
        });
    });

    test('shows cents and tolerates a missing note', () => {
        const vm = buildFundLedgerViewModel([{ id: 'x', date: '2026-01-15', amountCents: 1234 }]);
        expect(vm[0].entries[0]).toEqual({ id: 'x', dateLabel: 'Jan 15', amountLabel: '$12.34', note: '' });
        expect(vm[0].totalLabel).toBe('$12.34');
    });

    test('returns [] for empty or invalid input', () => {
        expect(buildFundLedgerViewModel([])).toEqual([]);
        expect(buildFundLedgerViewModel(null)).toEqual([]);
    });
});
