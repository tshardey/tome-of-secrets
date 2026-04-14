/**
 * Calendar period utilities for the character sheet.
 * Provides helpers to get the current calendar period and default
 * quest month/year dropdowns if they are empty.
 */

export function getCurrentCalendarPeriod() {
    const now = new Date();
    const monthNames = [
        'January', 'February', 'March', 'April', 'May', 'June',
        'July', 'August', 'September', 'October', 'November', 'December'
    ];
    return {
        month: monthNames[now.getMonth()],
        year: String(now.getFullYear())
    };
}

export function defaultQuestMonthYearIfEmpty() {
    const monthSel = document.getElementById('quest-month');
    const yearSel = document.getElementById('quest-year');
    const fallback = getCurrentCalendarPeriod();
    if (!monthSel || !yearSel) {
        return fallback;
    }
    if (!monthSel.value) {
        monthSel.value = fallback.month;
    }
    if (!yearSel.value) {
        yearSel.value = fallback.year;
    }
    return {
        month: monthSel.value?.trim?.() || fallback.month,
        year: yearSel.value?.trim?.() || fallback.year
    };
}
