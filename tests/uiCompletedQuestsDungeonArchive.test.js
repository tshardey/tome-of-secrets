/**
 * @jest-environment jsdom
 */

import * as ui from '../assets/js/character-sheet/ui.js';
import { characterState } from '../assets/js/character-sheet/state.js';
import { STORAGE_KEYS } from '../assets/js/character-sheet/storageKeys.js';

describe('ui.renderCompletedQuests dungeon archive sections', () => {
  beforeEach(() => {
    document.body.innerHTML = `
      <select id="keeperBackground"></select>
      <select id="wizardSchool"></select>

      <div id="completed-quests-container">
        <h3 id="completed-summary"></h3>
        <div class="completed-quests-sections">
          <div class="dungeon-archive-section">
            <h4>Dungeon Rooms</h4>
            <div id="dungeon-rooms-archive-container" class="dungeon-archive-cards-grid"></div>
          </div>
          <div class="dungeon-archive-section">
            <h4>Dungeon Encounters</h4>
            <div id="dungeon-encounters-archive-container" class="dungeon-archive-cards-grid"></div>
          </div>
          <div class="other-quests-section">
            <h4>Other Quests</h4>
            <div class="quest-cards-container"></div>
          </div>
        </div>
      </div>
    `;

    characterState[STORAGE_KEYS.COMPLETED_QUESTS] = [];
  });

  test('renders dungeon rooms + encounters into separate containers and keeps indices from original completed list', () => {
    const completed = [
      // originalIndex 0: non-dungeon
      {
        type: '♥ Organize the Stacks',
        prompt: 'Fantasy',
        book: 'A',
        month: 'Jan',
        year: '2024',
        rewards: { xp: 1, inkDrops: 0, paperScraps: 0, items: [] },
        buffs: [],
      },
      // originalIndex 1: dungeon room (challenge)
      {
        type: '♠ Dungeon Crawl',
        prompt: 'Room challenge',
        month: 'Jan',
        year: '2024',
        isEncounter: false,
        roomNumber: '1',
        rewards: { xp: 1, inkDrops: 0, paperScraps: 0, items: [] },
        buffs: [],
      },
      // originalIndex 2: dungeon encounter
      {
        type: '♠ Dungeon Crawl',
        prompt: 'Encounter prompt',
        month: 'Jan',
        year: '2024',
        isEncounter: true,
        roomNumber: '1',
        encounterName: 'Zombie',
        rewards: { xp: 1, inkDrops: 0, paperScraps: 0, items: [] },
        buffs: [],
      },
    ];

    characterState[STORAGE_KEYS.COMPLETED_QUESTS] = completed;

    ui.renderCompletedQuests();

    const rooms = document.querySelectorAll('#dungeon-rooms-archive-container .dungeon-archive-card');
    const encounters = document.querySelectorAll('#dungeon-encounters-archive-container .dungeon-archive-card');
    const otherCards = document.querySelectorAll('.other-quests-section .quest-cards-container .quest-card');

    expect(rooms).toHaveLength(1);
    expect(encounters).toHaveLength(1);
    expect(otherCards).toHaveLength(1);

    // Ensure indices preserved for delegated edit button routing
    expect(rooms[0].querySelector('.edit-quest-btn')?.dataset.index).toBe('1');
    expect(encounters[0].querySelector('.edit-quest-btn')?.dataset.index).toBe('2');
  });
});

