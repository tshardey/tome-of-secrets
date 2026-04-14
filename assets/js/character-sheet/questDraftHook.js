/**
 * Quest drafted effects hook factory.
 * Returns a function to assign to stateAdapter.applyQuestDraftedEffects.
 */

import { applyQuestDraftedEffects } from '../services/QuestDraftEffectService.js';
import { toast } from '../ui/toast.js';
import { getCurrentCalendarPeriod, defaultQuestMonthYearIfEmpty } from './calendarPeriod.js';

export function createQuestDraftedHook({ stateAdapter, updateCurrency, dataModule, form }) {
    return function questDraftedHook(addedQuests) {
        const drafted = Array.isArray(addedQuests) ? addedQuests : [];
        const firstWithPeriod = drafted.find((quest) => {
            const monthVal = typeof quest?.month === 'string' ? quest.month.trim() : '';
            const yearVal = typeof quest?.year === 'string' ? quest.year.trim() : '';
            return !!(monthVal && yearVal);
        });
        const questMonthEl = document.getElementById('quest-month');
        const questYearEl = document.getElementById('quest-year');
        const fallback = getCurrentCalendarPeriod();
        const monthFromQuest = typeof firstWithPeriod?.month === 'string' ? firstWithPeriod.month.trim() : '';
        const yearFromQuest = typeof firstWithPeriod?.year === 'string' ? firstWithPeriod.year.trim() : '';
        const monthRaw = questMonthEl?.value?.trim?.() || '';
        const yearRaw = questYearEl?.value?.trim?.() || '';
        const month = monthFromQuest || monthRaw || fallback.month;
        const year = yearFromQuest || yearRaw || fallback.year;
        applyQuestDraftedEffects(this, addedQuests, {
            updateCurrency,
            dataModule,
            toast,
            form,
            month,
            year
        });
    };
}
