import {
  parseDollarInput,
  formatCents,
  groupLedgerByMonth
} from '../../assets/js/services/FundLedgerService.js';

test('parseDollarInput', () => {
  expect(parseDollarInput('$20')).toBe(2000);
  expect(parseDollarInput('1,250.5')).toBe(125050);
  expect(parseDollarInput('12.345')).toBe(1235);
  ['', '0', '-5', 'abc', null].forEach(v => expect(parseDollarInput(v)).toBeNull());
});

test('parseDollarInput accepts surrounding whitespace and numbers, rejects junk suffixes', () => {
  expect(parseDollarInput('  $5.10 ')).toBe(510);
  expect(parseDollarInput(7)).toBe(700);
  expect(parseDollarInput('12abc')).toBeNull();
  expect(parseDollarInput('1.2.3')).toBeNull();
  expect(parseDollarInput('0.001')).toBeNull();
  expect(parseDollarInput(undefined)).toBeNull();
});

test('formatCents', () => {
  expect(formatCents(1234)).toBe('$12.34');
  expect(formatCents(1500)).toBe('$15');
  expect(formatCents(-500)).toBe('-$5');
  expect(formatCents(0)).toBe('$0');
  expect(formatCents(5)).toBe('$0.05');
  expect(formatCents(-1234)).toBe('-$12.34');
  expect(formatCents(NaN)).toBe('$0');
});

test('groupLedgerByMonth sorts newest first and totals per month', () => {
  const g = groupLedgerByMonth([
    { id: 'a', date: '2026-10-03', amountCents: 3200, note: '' },
    { id: 'b', date: '2026-11-01', amountCents: 1900, note: 'Legendarium purchase' },
    { id: 'c', date: '2026-11-07', amountCents: 500, note: '' },
  ]);
  expect(g.map(x => x.monthKey)).toEqual(['2026-11', '2026-10']);
  expect(g[0].totalCents).toBe(2400);
  expect(g[0].entries.map(e => e.id)).toEqual(['c', 'b']);
  expect(g[0].label).toBe('November 2026');
  expect(g[1].label).toBe('October 2026');
});

test('groupLedgerByMonth handles empty and non-array input', () => {
  expect(groupLedgerByMonth([])).toEqual([]);
  expect(groupLedgerByMonth(null)).toEqual([]);
});
