/**
 * FundLedgerViewModel - display-ready shape for the Fund's deduction receipt.
 *
 * Grouping and sorting come from FundLedgerService.groupLedgerByMonth (newest month first,
 * newest entry first); this module only adds the labels the renderer prints.
 */

import { formatCents, groupLedgerByMonth } from '../services/FundLedgerService.js';

const SHORT_MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/** 'YYYY-MM-DD' → 'Nov 7' (parsed from the string, so no timezone shift). */
function formatEntryDate(isoDate) {
    const [, month, day] = isoDate.split('-').map(Number);
    return `${SHORT_MONTHS[month - 1] || ''} ${day}`.trim();
}

/**
 * @param {Array<{ id: string, date: string, amountCents: number, note?: string }>} entries
 * @returns {Array<{ monthKey: string, label: string, totalLabel: string,
 *   entries: Array<{ id: string, dateLabel: string, amountLabel: string, note: string }> }>}
 */
export function buildFundLedgerViewModel(entries) {
    return groupLedgerByMonth(entries).map(group => ({
        monthKey: group.monthKey,
        label: group.label,
        totalLabel: formatCents(group.totalCents),
        entries: group.entries.map(entry => ({
            id: entry.id,
            dateLabel: formatEntryDate(entry.date),
            amountLabel: formatCents(entry.amountCents),
            note: typeof entry.note === 'string' ? entry.note : ''
        }))
    }));
}
