describe('dungeonArchiveCardsViewModel', () => {
  test('creates room and encounter archive card view models', () => {
    jest.isolateModules(() => {
      jest.doMock('../assets/js/character-sheet/data.js', () => ({
        dungeonRooms: {
          '1': {
            id: 'dungeon-room-the-hall-of-whispers',
            name: 'The Hall of Whispers',
            encountersDetailed: [{ name: 'Zombie' }],
          },
        },
      }));

      const { createDungeonArchiveCardsViewModel } = require('../assets/js/viewModels/dungeonArchiveCardsViewModel.js');

      const quests = [
        {
          type: '♠ Dungeon Crawl',
          isEncounter: false,
          roomNumber: '1',
          prompt: 'Room challenge',
        },
        {
          type: '♠ Dungeon Crawl',
          isEncounter: true,
          roomNumber: '1',
          encounterName: 'Zombie',
          prompt: 'Encounter prompt',
        },
      ];

      const vms = createDungeonArchiveCardsViewModel(quests);
      expect(vms).toHaveLength(2);

      const roomVm = vms[0];
      expect(roomVm.title).toBe('The Hall of Whispers');
      expect(roomVm.cardImage).toBe('assets/images/dungeons/the-hall-of-whispers.png');

      const encounterVm = vms[1];
      expect(encounterVm.title).toBe('Zombie');
      expect(encounterVm.cardImage).toBe('assets/images/encounters/encounter-zombie.png');
    });
  });
});

