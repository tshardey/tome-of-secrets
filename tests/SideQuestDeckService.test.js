/**
 * @jest-environment jsdom
 */

import {
    isSideQuestCompleted,
    isSideQuestActive,
    getAvailableSideQuests,
    drawRandomSideQuest
} from '../assets/js/services/SideQuestDeckService.js';
import { createSideQuestDeckViewModel } from '../assets/js/viewModels/questDeckViewModel.js';
import * as data from '../assets/js/character-sheet/data.js';
import { STORAGE_KEYS, createEmptyCharacterState } from '../assets/js/character-sheet/storageKeys.js';

describe('SideQuestDeckService contracts', () => {
    const questKey = '1';
    const quest = data.sideQuestsDetailed[questKey];
    const expectedPrompt = `${quest.name}: ${quest.prompt}`;

    test('completion match by stable sideQuestId', () => {
        const completed = [{ type: '♣ Side Quest', sideQuestId: quest.id, prompt: 'irrelevant' }];
        expect(isSideQuestCompleted(questKey, completed)).toBe(true);
    });

    test('completion fallback match by exact prompt', () => {
        const completed = [{ type: '♣ Side Quest', prompt: expectedPrompt }];
        expect(isSideQuestCompleted(questKey, completed)).toBe(true);
    });

    test('completion fallback match by quest name in prompt', () => {
        const completed = [{ type: '♣ Side Quest', prompt: `${quest.name}: custom text` }];
        expect(isSideQuestCompleted(questKey, completed)).toBe(true);
    });

    test('active match by stable sideQuestId', () => {
        const active = [{ type: '♣ Side Quest', sideQuestId: quest.id, prompt: 'irrelevant' }];
        expect(isSideQuestActive(questKey, active)).toBe(true);
    });

    test('available quest filtering excludes completed and active quests', () => {
        const state = createEmptyCharacterState();
        state[STORAGE_KEYS.COMPLETED_QUESTS] = [{ type: '♣ Side Quest', sideQuestId: data.sideQuestsDetailed['1'].id }];
        state[STORAGE_KEYS.ACTIVE_ASSIGNMENTS] = [{ type: '♣ Side Quest', sideQuestId: data.sideQuestsDetailed['2'].id }];

        const available = getAvailableSideQuests(state);
        const ids = new Set(available.map((q) => q.id));

        expect(ids.has(data.sideQuestsDetailed['1'].id)).toBe(false);
        expect(ids.has(data.sideQuestsDetailed['2'].id)).toBe(false);
        expect(available.length).toBe(Object.keys(data.sideQuestsDetailed).length - 2);
    });

    test('drawRandomSideQuest returns null for empty input', () => {
        expect(drawRandomSideQuest([])).toBeNull();
        expect(drawRandomSideQuest(null)).toBeNull();
    });

    test('drawRandomSideQuest returns member of available set', () => {
        const available = [{ id: 'a' }, { id: 'b' }, { id: 'c' }];
        const picked = drawRandomSideQuest(available);
        expect(available).toContain(picked);
    });

    test('deck view-model availability agrees with side quest service filtering', () => {
        const state = createEmptyCharacterState();
        state[STORAGE_KEYS.COMPLETED_QUESTS] = [{ type: '♣ Side Quest', sideQuestId: data.sideQuestsDetailed['1'].id }];
        state[STORAGE_KEYS.ACTIVE_ASSIGNMENTS] = [{ type: '♣ Side Quest', sideQuestId: data.sideQuestsDetailed['2'].id }];

        const serviceAvailable = getAvailableSideQuests(state);
        const vm = createSideQuestDeckViewModel(state, []);

        expect(vm.availableQuests).toHaveLength(serviceAvailable.length);
        expect(vm.deck.availableCount).toBe(serviceAvailable.length);
    });
});
