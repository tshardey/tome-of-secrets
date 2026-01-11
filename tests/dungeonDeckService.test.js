describe('DungeonDeckService', () => {
  test('checkRoomCompletionStatus uses roomNumber/isEncounter/encounterName when present', () => {
    jest.isolateModules(() => {
      jest.doMock('../assets/js/character-sheet/data.js', () => ({
        dungeonRooms: {
          '1': {
            challenge: 'Do the room challenge',
            encountersDetailed: [{ name: 'Zombie' }, { name: "Librarian's Spirit" }],
            encounters: {
              Zombie: { defeat: 'Defeat Zombie', befriend: 'Befriend Zombie' },
              "Librarian's Spirit": {
                defeat: 'Defeat Spirit',
                befriend: 'Befriend Spirit',
              },
            },
          },
        },
      }));

      const { checkRoomCompletionStatus } = require('../assets/js/services/DungeonDeckService.js');

      const completedQuests = [
        { type: '♠ Dungeon Crawl', roomNumber: '1', isEncounter: false, prompt: 'x' },
        {
          type: '♠ Dungeon Crawl',
          roomNumber: '1',
          isEncounter: true,
          encounterName: 'Zombie',
          prompt: 'y',
        },
      ];

      const status = checkRoomCompletionStatus('1', completedQuests);
      expect(status.challengeCompleted).toBe(true);
      expect(status.completedEncounters.has('Zombie')).toBe(true);
      expect(status.totalEncounters).toBe(2);
      expect(status.isFullyCompleted).toBe(false); // missing Librarian's Spirit
    });
  });

  test('getAvailableRooms excludes fully completed rooms', () => {
    jest.isolateModules(() => {
      jest.doMock('../assets/js/character-sheet/data.js', () => ({
        dungeonRooms: {
          '1': { challenge: 'C1', encountersDetailed: [{ name: 'A' }] },
          '2': { challenge: 'C2', encountersDetailed: [] },
        },
      }));

      const { STORAGE_KEYS } = require('../assets/js/character-sheet/storageKeys.js');
      const { getAvailableRooms } = require('../assets/js/services/DungeonDeckService.js');

      const state = {
        [STORAGE_KEYS.COMPLETED_QUESTS]: [
          { type: '♠ Dungeon Crawl', roomNumber: '1', isEncounter: false, prompt: 'C1' },
          { type: '♠ Dungeon Crawl', roomNumber: '1', isEncounter: true, encounterName: 'A', prompt: 'x' },
          { type: '♠ Dungeon Crawl', roomNumber: '2', isEncounter: false, prompt: 'C2' },
        ],
      };

      // Room 1: challenge + all encounters done => fully completed
      // Room 2: 0 encounters + challenge done => fully completed
      expect(getAvailableRooms(state)).toEqual([]);
    });
  });

  test('room is removed from the dungeon room deck once its challenge and every encounter are completed', () => {
    jest.isolateModules(() => {
      jest.doMock('../assets/js/character-sheet/data.js', () => ({
        dungeonRooms: {
          '1': { challenge: 'C1', encountersDetailed: [{ name: 'A' }, { name: 'B' }] },
        },
      }));

      const { STORAGE_KEYS } = require('../assets/js/character-sheet/storageKeys.js');
      const { getAvailableRooms, getAvailableEncounters } = require('../assets/js/services/DungeonDeckService.js');

      // Partially complete: challenge + one encounter => room still in deck; only remaining encounter available
      const partialState = {
        [STORAGE_KEYS.ACTIVE_ASSIGNMENTS]: [],
        [STORAGE_KEYS.COMPLETED_QUESTS]: [
          { type: '♠ Dungeon Crawl', roomNumber: '1', isEncounter: false, prompt: 'C1' },
          { type: '♠ Dungeon Crawl', roomNumber: '1', isEncounter: true, encounterName: 'A', prompt: 'x' },
        ],
      };
      expect(getAvailableRooms(partialState)).toEqual(['1']);
      expect(getAvailableEncounters('1', partialState).map(e => e.name)).toEqual(['B']);

      // Fully complete: challenge + all encounters => room removed; encounters empty
      const fullState = {
        [STORAGE_KEYS.ACTIVE_ASSIGNMENTS]: [],
        [STORAGE_KEYS.COMPLETED_QUESTS]: [
          { type: '♠ Dungeon Crawl', roomNumber: '1', isEncounter: false, prompt: 'C1' },
          { type: '♠ Dungeon Crawl', roomNumber: '1', isEncounter: true, encounterName: 'A', prompt: 'x' },
          { type: '♠ Dungeon Crawl', roomNumber: '1', isEncounter: true, encounterName: 'B', prompt: 'y' },
        ],
      };
      expect(getAvailableRooms(fullState)).toEqual([]);
      expect(getAvailableEncounters('1', fullState)).toEqual([]);
    });
  });
});

