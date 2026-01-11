/**
 * @jest-environment jsdom
 */

describe('DungeonDeckController', () => {
  test('handleRoomDeckClick draws a room and rerenders', () => {
    jest.isolateModules(() => {
      jest.doMock('../assets/js/character-sheet/state.js', () => ({
        characterState: {},
      }));

      jest.doMock('../assets/js/services/DungeonDeckService.js', () => ({
        getAvailableRooms: jest.fn(() => ['1', '2']),
        getAvailableEncounters: jest.fn(() => []),
        drawRandomRoom: jest.fn(() => '2'),
        drawRandomEncounter: jest.fn(() => null),
        checkRoomCompletionStatus: jest.fn(() => ({
          isFullyCompleted: false,
          challengeCompleted: false,
          completedEncounters: new Set(),
          totalEncounters: 0,
        })),
      }));

      jest.doMock('../assets/js/viewModels/dungeonDeckViewModel.js', () => ({
        createDungeonDeckViewModel: jest.fn(() => ({
          roomDeck: { cardbackImage: 'room-back.png', available: true, availableCount: 2 },
          encounterDeck: { cardbackImage: 'enc-back.png', available: false, availableCount: 0 },
        })),
        createDrawnCardViewModel: jest.fn(() => ({ room: null, encounter: null })),
      }));

      jest.doMock('../assets/js/character-sheet/cardRenderer.js', () => ({
        renderCardback: jest.fn(() => document.createElement('div')),
        renderRoomCard: jest.fn(() => null),
        renderEncounterCard: jest.fn(() => null),
      }));

      const { DungeonDeckController } = require('../assets/js/controllers/DungeonDeckController.js');

      document.body.innerHTML = `
        <form id="character-sheet">
          <div id="room-deck-container"></div>
          <div id="encounter-deck-container"></div>
          <div id="drawn-card-display"></div>
          <button id="add-quest-from-cards-btn" type="button"></button>
          <button id="clear-drawn-cards-btn" type="button"></button>
        </form>
      `;

      const form = document.getElementById('character-sheet');
      const stateAdapter = {
        on: jest.fn(),
        addActiveQuests: jest.fn(),
      };
      const dependencies = { ui: { renderActiveAssignments: jest.fn() }, saveState: jest.fn() };

      const controller = new DungeonDeckController(stateAdapter, form, dependencies);
      controller.initialize();

      const renderDecksSpy = jest.spyOn(controller, 'renderDecks');
      controller.handleRoomDeckClick();

      expect(controller.drawnRoomNumber).toBe('2');
      expect(renderDecksSpy).toHaveBeenCalled();
    });
  });

  test('handleEncounterDeckClick draws an encounter and rerenders drawn cards', () => {
    jest.isolateModules(() => {
      jest.doMock('../assets/js/character-sheet/state.js', () => ({
        characterState: {},
      }));

      jest.doMock('../assets/js/services/DungeonDeckService.js', () => ({
        getAvailableRooms: jest.fn(() => ['1']),
        getAvailableEncounters: jest.fn(() => [{ name: 'Zombie' }]),
        drawRandomRoom: jest.fn(() => '1'),
        drawRandomEncounter: jest.fn(() => ({ name: 'Zombie' })),
        checkRoomCompletionStatus: jest.fn(() => ({
          isFullyCompleted: false,
          challengeCompleted: false,
          completedEncounters: new Set(),
          totalEncounters: 1,
        })),
      }));

      jest.doMock('../assets/js/viewModels/dungeonDeckViewModel.js', () => ({
        createDungeonDeckViewModel: jest.fn(() => ({
          roomDeck: { cardbackImage: 'room-back.png', available: true, availableCount: 1 },
          encounterDeck: { cardbackImage: 'enc-back.png', available: true, availableCount: 1 },
        })),
        createDrawnCardViewModel: jest.fn(() => ({ room: null, encounter: null })),
      }));

      jest.doMock('../assets/js/character-sheet/cardRenderer.js', () => ({
        renderCardback: jest.fn(() => document.createElement('div')),
        renderRoomCard: jest.fn(() => null),
        renderEncounterCard: jest.fn(() => null),
      }));

      const { DungeonDeckController } = require('../assets/js/controllers/DungeonDeckController.js');

      document.body.innerHTML = `
        <form id="character-sheet">
          <div id="room-deck-container"></div>
          <div id="encounter-deck-container"></div>
          <div id="drawn-card-display"></div>
          <button id="add-quest-from-cards-btn" type="button"></button>
          <button id="clear-drawn-cards-btn" type="button"></button>
        </form>
      `;

      const form = document.getElementById('character-sheet');
      const stateAdapter = {
        on: jest.fn(),
        addActiveQuests: jest.fn(),
      };
      const dependencies = { ui: { renderActiveAssignments: jest.fn() }, saveState: jest.fn() };

      const controller = new DungeonDeckController(stateAdapter, form, dependencies);
      controller.initialize();
      controller.drawnRoomNumber = '1';

      const renderDrawnCardsSpy = jest.spyOn(controller, 'renderDrawnCards');
      controller.handleEncounterDeckClick();

      expect(controller.drawnEncounterData).toEqual({ name: 'Zombie' });
      expect(renderDrawnCardsSpy).toHaveBeenCalled();
    });
  });

  test('handleAddQuestFromCards adds quests and clears draw', () => {
    jest.isolateModules(() => {
      const characterState = {};

      jest.doMock('../assets/js/character-sheet/state.js', () => ({
        characterState,
      }));

      jest.doMock('../assets/js/character-sheet/data.js', () => ({
        dungeonRooms: {
          '1': {
            challenge: 'Do the room thing',
            encountersDetailed: [{ name: 'Zombie', befriend: 'Befriend it', defeat: 'Defeat it' }],
          },
        },
      }));

      jest.doMock('../assets/js/services/RewardCalculator.js', () => ({
        RewardCalculator: {
          getBaseRewards: jest.fn(() => ({
            toJSON: () => ({ xp: 1, inkDrops: 0, paperScraps: 0, items: [] }),
          })),
        },
      }));

      jest.doMock('../assets/js/services/DungeonDeckService.js', () => ({
        getAvailableRooms: jest.fn(() => ['1']),
        getAvailableEncounters: jest.fn(() => [{ name: 'Zombie', befriend: 'Befriend it', defeat: 'Defeat it' }]),
        drawRandomRoom: jest.fn(() => '1'),
        drawRandomEncounter: jest.fn(() => ({ name: 'Zombie', befriend: 'Befriend it', defeat: 'Defeat it' })),
        checkRoomCompletionStatus: jest.fn(() => ({
          isFullyCompleted: false,
          challengeCompleted: false,
          completedEncounters: new Set(),
          totalEncounters: 1,
        })),
      }));

      jest.doMock('../assets/js/viewModels/dungeonDeckViewModel.js', () => ({
        createDungeonDeckViewModel: jest.fn(() => ({
          roomDeck: { cardbackImage: 'room-back.png', available: true, availableCount: 1 },
          encounterDeck: { cardbackImage: 'enc-back.png', available: true, availableCount: 1 },
        })),
        createDrawnCardViewModel: jest.fn(() => ({ room: null, encounter: null })),
      }));

      jest.doMock('../assets/js/character-sheet/cardRenderer.js', () => ({
        renderCardback: jest.fn(() => document.createElement('div')),
        renderRoomCard: jest.fn(() => null),
        renderEncounterCard: jest.fn(() => null),
      }));

      const { STORAGE_KEYS } = require('../assets/js/character-sheet/storageKeys.js');
      const { DungeonDeckController } = require('../assets/js/controllers/DungeonDeckController.js');

      characterState[STORAGE_KEYS.COMPLETED_QUESTS] = [];

      document.body.innerHTML = `
        <form id="character-sheet">
          <div id="room-deck-container"></div>
          <div id="encounter-deck-container"></div>
          <div id="drawn-card-display"></div>
          <button id="add-quest-from-cards-btn" type="button"></button>
          <button id="clear-drawn-cards-btn" type="button"></button>
        </form>
      `;

      const form = document.getElementById('character-sheet');
      const stateAdapter = {
        on: jest.fn(),
        addActiveQuests: jest.fn(),
      };
      const dependencies = { ui: { renderActiveAssignments: jest.fn() }, saveState: jest.fn() };

      const controller = new DungeonDeckController(stateAdapter, form, dependencies);
      controller.initialize();

      controller.drawnRoomNumber = '1';
      controller.drawnEncounterData = { name: 'Zombie', befriend: 'Befriend it', defeat: 'Defeat it' };

      controller.handleAddQuestFromCards();

      expect(stateAdapter.addActiveQuests).toHaveBeenCalledWith(
        expect.arrayContaining([
          expect.objectContaining({ type: '♠ Dungeon Crawl', isEncounter: false, roomNumber: '1' }),
          expect.objectContaining({
            type: '♠ Dungeon Crawl',
            isEncounter: true,
            roomNumber: '1',
            encounterName: 'Zombie',
            isBefriend: true,
          }),
        ])
      );
      expect(dependencies.saveState).toHaveBeenCalled();
      expect(controller.drawnRoomNumber).toBe(null);
      expect(controller.drawnEncounterData).toBe(null);
    });
  });

  test('room with no encounters can be added without drawing an encounter (no toast block)', () => {
    jest.isolateModules(() => {
      const characterState = {};

      jest.doMock('../assets/js/ui/toast.js', () => ({
        toast: { warning: jest.fn(), error: jest.fn(), info: jest.fn(), success: jest.fn() },
      }));

      jest.doMock('../assets/js/character-sheet/state.js', () => ({
        characterState,
      }));

      jest.doMock('../assets/js/character-sheet/data.js', () => ({
        dungeonRooms: {
          '10': {
            // Example: an encounterless room like "Author's Study"
            challenge: 'Read a book in the author’s study.',
            encountersDetailed: [],
          },
        },
      }));

      jest.doMock('../assets/js/services/RewardCalculator.js', () => ({
        RewardCalculator: {
          getBaseRewards: jest.fn(() => ({
            toJSON: () => ({ xp: 1, inkDrops: 0, paperScraps: 0, items: [] }),
          })),
        },
      }));

      jest.doMock('../assets/js/services/DungeonDeckService.js', () => ({
        getAvailableRooms: jest.fn(() => ['10']),
        getAvailableEncounters: jest.fn(() => []),
        drawRandomRoom: jest.fn(() => '10'),
        drawRandomEncounter: jest.fn(() => null),
        checkRoomCompletionStatus: jest.fn(() => ({
          isFullyCompleted: false,
          challengeCompleted: false,
          challengeActive: false,
          completedEncounters: new Set(),
          activeEncounters: new Set(),
          totalEncounters: 0,
        })),
      }));

      jest.doMock('../assets/js/viewModels/dungeonDeckViewModel.js', () => ({
        createDungeonDeckViewModel: jest.fn(() => ({
          roomDeck: { cardbackImage: 'room-back.png', available: true, availableCount: 1 },
          encounterDeck: { cardbackImage: 'enc-back.png', available: false, availableCount: 0 },
        })),
        createDrawnCardViewModel: jest.fn(() => ({ room: null, encounter: null })),
      }));

      jest.doMock('../assets/js/character-sheet/cardRenderer.js', () => ({
        renderCardback: jest.fn(() => document.createElement('div')),
        renderRoomCard: jest.fn(() => null),
        renderEncounterCard: jest.fn(() => null),
      }));

      const { STORAGE_KEYS } = require('../assets/js/character-sheet/storageKeys.js');
      const { toast } = require('../assets/js/ui/toast.js');
      const { DungeonDeckController } = require('../assets/js/controllers/DungeonDeckController.js');

      characterState[STORAGE_KEYS.ACTIVE_ASSIGNMENTS] = [];
      characterState[STORAGE_KEYS.COMPLETED_QUESTS] = [];

      document.body.innerHTML = `
        <form id="character-sheet">
          <div id="room-deck-container"></div>
          <div id="encounter-deck-container"></div>
          <div id="drawn-card-display"></div>
          <button id="add-quest-from-cards-btn" type="button"></button>
          <button id="clear-drawn-cards-btn" type="button"></button>
        </form>
      `;

      const form = document.getElementById('character-sheet');
      const stateAdapter = {
        on: jest.fn(),
        addActiveQuests: jest.fn(),
      };
      const dependencies = { ui: { renderActiveAssignments: jest.fn() }, saveState: jest.fn() };

      const controller = new DungeonDeckController(stateAdapter, form, dependencies);
      controller.initialize();

      controller.drawnRoomNumber = '10';
      controller.drawnEncounterData = null; // no encounter drawn

      controller.handleAddQuestFromCards();

      // Should add the room challenge quest
      expect(stateAdapter.addActiveQuests).toHaveBeenCalledWith(
        expect.arrayContaining([expect.objectContaining({ type: '♠ Dungeon Crawl', roomNumber: '10', isEncounter: false })])
      );

      // Should NOT block on "draw an encounter" warning
      expect(toast.warning).not.toHaveBeenCalledWith(
        expect.stringContaining('Please draw an encounter')
      );
    });
  });

  test('cannot add a duplicate active dungeon room/encounter; can add again after it is removed from active (discarded)', () => {
    jest.isolateModules(() => {
      const characterState = {};

      jest.doMock('../assets/js/ui/toast.js', () => ({
        toast: { warning: jest.fn(), error: jest.fn(), info: jest.fn(), success: jest.fn() },
      }));

      jest.doMock('../assets/js/character-sheet/state.js', () => ({
        characterState,
      }));

      jest.doMock('../assets/js/character-sheet/data.js', () => ({
        dungeonRooms: {
          '1': {
            challenge: 'Room challenge',
            encountersDetailed: [{ name: 'Zombie', befriend: 'Befriend it', defeat: 'Defeat it' }],
          },
        },
      }));

      jest.doMock('../assets/js/services/RewardCalculator.js', () => ({
        RewardCalculator: {
          getBaseRewards: jest.fn(() => ({
            toJSON: () => ({ xp: 1, inkDrops: 0, paperScraps: 0, items: [] }),
          })),
        },
      }));

      jest.doMock('../assets/js/services/DungeonDeckService.js', () => ({
        getAvailableRooms: jest.fn(() => ['1']),
        getAvailableEncounters: jest.fn(() => [{ name: 'Zombie', befriend: 'Befriend it', defeat: 'Defeat it' }]),
        drawRandomRoom: jest.fn(() => '1'),
        drawRandomEncounter: jest.fn(() => ({ name: 'Zombie', befriend: 'Befriend it', defeat: 'Defeat it' })),
        checkRoomCompletionStatus: jest.fn(() => ({
          isFullyCompleted: false,
          challengeCompleted: false,
          challengeActive: false,
          completedEncounters: new Set(),
          activeEncounters: new Set(['Zombie']),
          totalEncounters: 1,
        })),
      }));

      jest.doMock('../assets/js/viewModels/dungeonDeckViewModel.js', () => ({
        createDungeonDeckViewModel: jest.fn(() => ({
          roomDeck: { cardbackImage: 'room-back.png', available: true, availableCount: 1 },
          encounterDeck: { cardbackImage: 'enc-back.png', available: true, availableCount: 1 },
        })),
        createDrawnCardViewModel: jest.fn(() => ({ room: null, encounter: null })),
      }));

      jest.doMock('../assets/js/character-sheet/cardRenderer.js', () => ({
        renderCardback: jest.fn(() => document.createElement('div')),
        renderRoomCard: jest.fn(() => null),
        renderEncounterCard: jest.fn(() => null),
      }));

      const { STORAGE_KEYS } = require('../assets/js/character-sheet/storageKeys.js');
      const { toast } = require('../assets/js/ui/toast.js');
      const { DungeonDeckController } = require('../assets/js/controllers/DungeonDeckController.js');

      characterState[STORAGE_KEYS.COMPLETED_QUESTS] = [];
      characterState[STORAGE_KEYS.DISCARDED_QUESTS] = [];
      characterState[STORAGE_KEYS.ACTIVE_ASSIGNMENTS] = [
        { type: '♠ Dungeon Crawl', isEncounter: false, roomNumber: '1', prompt: 'Room challenge' },
        { type: '♠ Dungeon Crawl', isEncounter: true, roomNumber: '1', encounterName: 'Zombie', prompt: 'Befriend it' },
      ];

      document.body.innerHTML = `
        <form id="character-sheet">
          <div id="room-deck-container"></div>
          <div id="encounter-deck-container"></div>
          <div id="drawn-card-display"></div>
          <button id="add-quest-from-cards-btn" type="button"></button>
          <button id="clear-drawn-cards-btn" type="button"></button>
        </form>
      `;

      const form = document.getElementById('character-sheet');
      const stateAdapter = {
        on: jest.fn(),
        addActiveQuests: jest.fn(),
      };
      const dependencies = { ui: { renderActiveAssignments: jest.fn() }, saveState: jest.fn() };

      const controller = new DungeonDeckController(stateAdapter, form, dependencies);
      controller.initialize();

      controller.drawnRoomNumber = '1';
      controller.drawnEncounterData = { name: 'Zombie', befriend: 'Befriend it', defeat: 'Defeat it' };

      controller.handleAddQuestFromCards();
      expect(stateAdapter.addActiveQuests).not.toHaveBeenCalled();
      expect(toast.warning).toHaveBeenCalledWith(expect.stringContaining('already in your quest log'));

      // Simulate discarding/removing from active: allow re-add
      characterState[STORAGE_KEYS.ACTIVE_ASSIGNMENTS] = [];
      toast.warning.mockClear();
      controller.handleAddQuestFromCards();
      expect(stateAdapter.addActiveQuests).toHaveBeenCalled();
      expect(toast.warning).not.toHaveBeenCalledWith(expect.stringContaining('already in your quest log'));
    });
  });
});

