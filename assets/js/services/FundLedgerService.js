/**
 * FundLedgerService — pure helpers for the real-dollar Fund.
 *
 * Amounts are stored as integer cents everywhere (see StateAdapter fund methods).
 * Ledger entry shape: { id: string, date: 'YYYY-MM-DD', amountCents: positive integer, note: string }
 */

const MONTH_NAMES = [
    'January', 'February', 'March', 'April', 'May', 'June',
    'July', 'August', 'September', 'October', 'November', 'December'
];

const DOLLAR_PATTERN = /^(\d*)(?:\.(\d*))?$/;
const DATE_PATTERN = /^(\d{4})-(\d{2})-\d{2}$/;

/**
 * Parse a player-typed dollar amount into cents.
 * Strips `$`, `,` and surrounding whitespace, rounds half-up to the nearest cent,
 * and requires the result to be > 0. Uses string arithmetic so values like
 * "12.345" round to 1235 without floating-point drift.
 * @param {string|number|null|undefined} raw
 * @returns {number|null} cents, or null when the input is not a positive amount
 */
export function parseDollarInput(raw) {
    if (raw === null || raw === undefined) return null;
    if (typeof raw === 'number') {
        if (!Number.isFinite(raw)) return null;
        raw = String(raw);
    }
    if (typeof raw !== 'string') return null;

    const cleaned = raw.replace(/[$,\s]/g, '');
    const match = DOLLAR_PATTERN.exec(cleaned);
    if (!match) return null;
    const [, wholePart, fractionPart = ''] = match;
    if (!wholePart && !fractionPart) return null;

    const whole = wholePart ? parseInt(wholePart, 10) : 0;
    const fraction = (fractionPart + '00').slice(0, 2);
    const roundUp = fractionPart.length > 2 && Number(fractionPart[2]) >= 5;
    const cents = whole * 100 + parseInt(fraction, 10) + (roundUp ? 1 : 0);

    return Number.isSafeInteger(cents) && cents > 0 ? cents : null;
}

/**
 * Format integer cents as a dollar string.
 * 1234 → "$12.34", 1500 → "$15", -500 → "-$5". Whole dollars drop the cents.
 * @param {number} cents
 * @returns {string}
 */
export function formatCents(cents) {
    const value = Number.isFinite(cents) ? Math.round(cents) : 0;
    const sign = value < 0 ? '-' : '';
    const abs = Math.abs(value);
    const dollars = Math.floor(abs / 100).toLocaleString('en-US');
    const remainder = abs % 100;
    const fraction = remainder ? `.${String(remainder).padStart(2, '0')}` : '';
    return `${sign}$${dollars}${fraction}`;
}

/**
 * Whether a value is a 'YYYY-MM-DD' date string (shape check only).
 * @param {*} value
 * @returns {boolean}
 */
export function isIsoDate(value) {
    return typeof value === 'string' && DATE_PATTERN.test(value);
}

/**
 * Local calendar date as 'YYYY-MM-DD' (not UTC, so late-evening deductions land on the right day).
 * @param {Date} [date]
 * @returns {string}
 */
export function todayIsoDate(date = new Date()) {
    const y = date.getFullYear();
    const m = String(date.getMonth() + 1).padStart(2, '0');
    const d = String(date.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
}

/**
 * Group ledger entries by calendar month.
 * Groups are newest month first; entries within a group are newest date first
 * (same-date entries keep most-recently-added first). Entries without a valid
 * YYYY-MM-DD date are skipped.
 * @param {Array<{ id: string, date: string, amountCents: number, note: string }>} entries
 * @returns {Array<{ monthKey: string, label: string, totalCents: number, entries: Array }>}
 */
export function groupLedgerByMonth(entries) {
    if (!Array.isArray(entries)) return [];

    const sorted = entries
        .map((entry, index) => ({ entry, index }))
        .filter(({ entry }) => entry && isIsoDate(entry.date))
        .sort((a, b) => {
            if (a.entry.date !== b.entry.date) return a.entry.date < b.entry.date ? 1 : -1;
            return b.index - a.index;
        })
        .map(({ entry }) => entry);

    const groups = [];
    const byKey = new Map();
    for (const entry of sorted) {
        const [, year, month] = DATE_PATTERN.exec(entry.date);
        const monthKey = `${year}-${month}`;
        let group = byKey.get(monthKey);
        if (!group) {
            const monthName = MONTH_NAMES[Number(month) - 1] || month;
            group = { monthKey, label: `${monthName} ${year}`, totalCents: 0, entries: [] };
            byKey.set(monthKey, group);
            groups.push(group);
        }
        group.entries.push(entry);
        group.totalCents += Number.isFinite(entry.amountCents) ? entry.amountCents : 0;
    }
    return groups;
}
