describe('Dungeon room card image path consistency', () => {
  test('renderQuestCard and dungeonArchiveCardsViewModel derive the same fallback image path for apostrophes when no cardImage/id is present', () => {
    jest.isolateModules(() => {
      jest.doMock('../assets/js/character-sheet/data.js', () => ({
        dungeonRooms: {
          '1': {
            // Intentionally omit `id` and `cardImage` to exercise fallback slug logic
            name: "The Shroud's Heart",
          },
        },
        allItems: {},
        wings: {},
      }));

      const { renderQuestCard } = require('../assets/js/character-sheet/renderComponents.js');
      const { createDungeonArchiveCardsViewModel } = require('../assets/js/viewModels/dungeonArchiveCardsViewModel.js');

      const quest = {
        type: '♠ Dungeon Crawl',
        prompt: 'Room challenge',
        month: 'Jan',
        year: '2024',
        isEncounter: false,
        roomNumber: '1',
        rewards: { xp: 1, inkDrops: 0, paperScraps: 0, items: [] },
        buffs: [],
      };

      const card = renderQuestCard(quest, 0, 'active');
      const img = card.querySelector('.quest-card-dungeon-image');
      expect(img).toBeTruthy();
      expect(img.getAttribute('src')).toBe('assets/images/dungeons/the-shrouds-heart.png');

      const vm = createDungeonArchiveCardsViewModel([quest])[0];
      expect(vm.cardImage).toBe('assets/images/dungeons/the-shrouds-heart.png');
    });
  });
});

