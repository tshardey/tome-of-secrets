/**
 * @jest-environment jsdom
 *
 * Tests for OtherQuestDeckController: Extra Credit deck draw/add and Restoration wing/project selection.
 */

describe('OtherQuestDeckController', () => {
    test('initialize returns early when required DOM elements are missing', () => {
        jest.isolateModules(() => {
            jest.doMock('../assets/js/character-sheet/state.js', () => ({ characterState: {} }));
            jest.doMock('../assets/js/viewModels/questDeckViewModel.js', () => ({
                createExtraCreditDeckViewModel: jest.fn(),
                createRestorationDeckViewModel: jest.fn()
            }));
            jest.doMock('../assets/js/character-sheet/cardRenderer.js', () => ({
                renderCardback: jest.fn(() => document.createElement('div')),
                renderExtraCreditCard: jest.fn(() => document.createElement('div')),
                renderRestorationProjectCard: jest.fn(() => null),
                renderRestorationWingCardback: jest.fn(() => document.createElement('div')),
                wrapCardSelectable: jest.fn((el) => el)
            }));
            jest.doMock('../assets/js/utils/questCardImage.js', () => ({
                getExtraCreditCardImage: jest.fn(() => 'card.png'),
                getRestorationCardbackImage: jest.fn(() => 'restoration-back.png')
            }));

            const { OtherQuestDeckController } = require('../assets/js/controllers/OtherQuestDeckController.js');

            document.body.innerHTML = `
                <form id="character-sheet">
                    <div id="extra-credit-deck-container"></div>
                </form>
            `;

            const form = document.getElementById('character-sheet');
            const stateAdapter = { on: jest.fn() };
            const dependencies = { ui: {}, saveState: jest.fn(), updateDeckActionsLabel: jest.fn() };

            const controller = new OtherQuestDeckController(stateAdapter, form, dependencies);
            controller.initialize();

            expect(controller.extraCreditDeckContainer).toBeUndefined();
            expect(controller.extraCreditDrawnDisplay).toBeUndefined();
        });
    });

    test('handleExtraCreditDeckClick adds one card to drawnExtraCredit and selects it', () => {
        jest.isolateModules(() => {
            jest.doMock('../assets/js/character-sheet/state.js', () => ({ characterState: {} }));
            jest.doMock('../assets/js/viewModels/questDeckViewModel.js', () => ({
                createExtraCreditDeckViewModel: jest.fn((drawn) => ({
                    deck: { cardbackImage: 'back.png', available: true, availableCount: 1 },
                    drawnCards: (drawn || []).map((item) => ({ cardImage: item?.cardImage || 'card.png' }))
                })),
                createRestorationDeckViewModel: jest.fn(() => ({ wings: [], projects: [] }))
            }));
            jest.doMock('../assets/js/character-sheet/cardRenderer.js', () => ({
                renderCardback: jest.fn(() => document.createElement('div')),
                renderExtraCreditCard: jest.fn(() => document.createElement('div')),
                renderRestorationProjectCard: jest.fn(() => null),
                renderRestorationWingCardback: jest.fn(() => document.createElement('div')),
                wrapCardSelectable: jest.fn((el) => el)
            }));
            jest.doMock('../assets/js/utils/questCardImage.js', () => ({
                getExtraCreditCardImage: jest.fn(() => 'extra-credit.png'),
                getRestorationCardbackImage: jest.fn(() => 'restoration-back.png')
            }));

            const { OtherQuestDeckController } = require('../assets/js/controllers/OtherQuestDeckController.js');

            document.body.innerHTML = `
                <form id="character-sheet">
                    <div id="extra-credit-deck-container"></div>
                    <div id="extra-credit-drawn-card-display"></div>
                    <div id="restoration-entry-container"></div>
                    <div id="restoration-expandable" style="display: none;"></div>
                    <div id="restoration-wing-cards-container"></div>
                    <div id="restoration-drawn-card-display"></div>
                </form>
            `;

            const form = document.getElementById('character-sheet');
            const stateAdapter = { on: jest.fn() };
            const dependencies = { ui: { renderActiveAssignments: jest.fn() }, saveState: jest.fn(), updateDeckActionsLabel: jest.fn() };

            const controller = new OtherQuestDeckController(stateAdapter, form, dependencies);
            controller.initialize();

            expect(controller.drawnExtraCredit).toHaveLength(0);

            controller.handleExtraCreditDeckClick();

            expect(controller.drawnExtraCredit).toHaveLength(1);
            expect(controller.drawnExtraCredit[0].cardImage).toBe('extra-credit.png');
            expect(controller.selectedIndicesExtraCredit.has(0)).toBe(true);

            controller.handleExtraCreditDeckClick();

            expect(controller.drawnExtraCredit).toHaveLength(2);
            expect(controller.selectedIndicesExtraCredit.has(1)).toBe(true);
        });
    });

    test('handleAddExtraCreditFromCard adds quests and clears drawn Extra Credit', () => {
        jest.isolateModules(() => {
            const characterState = {};
            jest.doMock('../assets/js/character-sheet/state.js', () => ({ characterState }));
            jest.doMock('../assets/js/viewModels/questDeckViewModel.js', () => ({
                createExtraCreditDeckViewModel: jest.fn((drawn) => ({
                    deck: { cardbackImage: 'back.png', available: true, availableCount: 1 },
                    drawnCards: (drawn || []).map((item) => ({ cardImage: item?.cardImage || 'card.png' }))
                })),
                createRestorationDeckViewModel: jest.fn(() => ({ wings: [], projects: [] }))
            }));
            jest.doMock('../assets/js/character-sheet/cardRenderer.js', () => ({
                renderCardback: jest.fn(() => document.createElement('div')),
                renderExtraCreditCard: jest.fn(() => document.createElement('div')),
                renderRestorationProjectCard: jest.fn(() => null),
                renderRestorationWingCardback: jest.fn(() => document.createElement('div')),
                wrapCardSelectable: jest.fn((el) => el)
            }));
            jest.doMock('../assets/js/utils/questCardImage.js', () => ({
                getExtraCreditCardImage: jest.fn(() => 'extra-credit.png'),
                getRestorationCardbackImage: jest.fn(() => 'restoration-back.png')
            }));

            const { OtherQuestDeckController } = require('../assets/js/controllers/OtherQuestDeckController.js');

            document.body.innerHTML = `
                <form id="character-sheet">
                    <div id="extra-credit-deck-container"></div>
                    <div id="extra-credit-drawn-card-display"></div>
                    <div id="restoration-entry-container"></div>
                    <div id="restoration-expandable" style="display: none;"></div>
                    <div id="restoration-wing-cards-container"></div>
                    <div id="restoration-drawn-card-display"></div>
                </form>
            `;

            const form = document.getElementById('character-sheet');
            const addActiveQuests = jest.fn();
            const stateAdapter = { on: jest.fn(), addActiveQuests };
            const dependencies = { ui: { renderActiveAssignments: jest.fn() }, saveState: jest.fn(), updateDeckActionsLabel: jest.fn() };

            const controller = new OtherQuestDeckController(stateAdapter, form, dependencies);
            controller.initialize();

            controller.drawnExtraCredit = [
                { cardImage: 'extra-credit.png' },
                { cardImage: 'extra-credit.png' }
            ];
            controller.selectedIndicesExtraCredit = new Set([0, 1]);

            controller.handleAddExtraCreditFromCard();

            expect(addActiveQuests).toHaveBeenCalledTimes(1);
            const added = addActiveQuests.mock.calls[0][0];
            expect(Array.isArray(added)).toBe(true);
            expect(added).toHaveLength(2);
            expect(added[0].type).toBe('⭐ Extra Credit');
            expect(added[1].type).toBe('⭐ Extra Credit');
            expect(controller.drawnExtraCredit).toHaveLength(0);
            expect(controller.selectedIndicesExtraCredit.size).toBe(0);
        });
    });

    test('handleClearDraw clears both Extra Credit and Restoration state', () => {
        jest.isolateModules(() => {
            jest.doMock('../assets/js/character-sheet/state.js', () => ({ characterState: {} }));
            jest.doMock('../assets/js/viewModels/questDeckViewModel.js', () => ({
                createExtraCreditDeckViewModel: jest.fn(() => ({
                    deck: { cardbackImage: 'back.png', available: true, availableCount: 1 },
                    drawnCards: []
                })),
                createRestorationDeckViewModel: jest.fn(() => ({ wings: [], projects: [] }))
            }));
            jest.doMock('../assets/js/character-sheet/cardRenderer.js', () => ({
                renderCardback: jest.fn(() => document.createElement('div')),
                renderExtraCreditCard: jest.fn(() => document.createElement('div')),
                renderRestorationProjectCard: jest.fn(() => null),
                renderRestorationWingCardback: jest.fn(() => document.createElement('div')),
                wrapCardSelectable: jest.fn((el) => el)
            }));
            jest.doMock('../assets/js/utils/questCardImage.js', () => ({
                getExtraCreditCardImage: jest.fn(() => 'extra-credit.png'),
                getRestorationCardbackImage: jest.fn(() => 'restoration-back.png')
            }));

            const { OtherQuestDeckController } = require('../assets/js/controllers/OtherQuestDeckController.js');

            document.body.innerHTML = `
                <form id="character-sheet">
                    <div id="extra-credit-deck-container"></div>
                    <div id="extra-credit-drawn-card-display"></div>
                    <div id="restoration-entry-container"></div>
                    <div id="restoration-expandable" style="display: none;"></div>
                    <div id="restoration-wing-cards-container"></div>
                    <div id="restoration-drawn-card-display"></div>
                </form>
            `;

            const form = document.getElementById('character-sheet');
            const stateAdapter = { on: jest.fn() };
            const dependencies = { ui: {}, saveState: jest.fn(), updateDeckActionsLabel: jest.fn() };

            const controller = new OtherQuestDeckController(stateAdapter, form, dependencies);
            controller.initialize();

            controller.drawnExtraCredit = [{ cardImage: 'x.png' }];
            controller.selectedIndicesExtraCredit = new Set([0]);
            controller.selectedWingId = '6';
            controller.selectedIndices = new Set([0, 1]);

            controller.handleClearDraw();

            expect(controller.drawnExtraCredit).toHaveLength(0);
            expect(controller.selectedIndicesExtraCredit.size).toBe(0);
            expect(controller.selectedWingId).toBeNull();
            expect(controller.selectedIndices.size).toBe(0);
        });
    });

    test('handleWingSelect sets selectedWingId and clears restoration selectedIndices', () => {
        jest.isolateModules(() => {
            jest.doMock('../assets/js/character-sheet/state.js', () => ({ characterState: {} }));
            jest.doMock('../assets/js/viewModels/questDeckViewModel.js', () => ({
                createExtraCreditDeckViewModel: jest.fn(() => ({
                    deck: { cardbackImage: 'back.png', available: true, availableCount: 1 },
                    drawnCards: []
                })),
                createRestorationDeckViewModel: jest.fn(() => ({ wings: [{ wingId: '6', name: 'Heart' }], projects: [] }))
            }));
            jest.doMock('../assets/js/character-sheet/cardRenderer.js', () => ({
                renderCardback: jest.fn(() => document.createElement('div')),
                renderExtraCreditCard: jest.fn(() => document.createElement('div')),
                renderRestorationProjectCard: jest.fn(() => null),
                renderRestorationWingCardback: jest.fn(() => document.createElement('div')),
                wrapCardSelectable: jest.fn((el) => el)
            }));
            jest.doMock('../assets/js/utils/questCardImage.js', () => ({
                getExtraCreditCardImage: jest.fn(() => 'extra-credit.png'),
                getRestorationCardbackImage: jest.fn(() => 'restoration-back.png')
            }));

            const { OtherQuestDeckController } = require('../assets/js/controllers/OtherQuestDeckController.js');

            document.body.innerHTML = `
                <form id="character-sheet">
                    <div id="extra-credit-deck-container"></div>
                    <div id="extra-credit-drawn-card-display"></div>
                    <div id="restoration-entry-container"></div>
                    <div id="restoration-expandable" style="display: none;"></div>
                    <div id="restoration-wing-cards-container"></div>
                    <div id="restoration-drawn-card-display"></div>
                </form>
            `;

            const form = document.getElementById('character-sheet');
            const stateAdapter = { on: jest.fn() };
            const dependencies = { ui: {}, saveState: jest.fn(), updateDeckActionsLabel: jest.fn() };

            const controller = new OtherQuestDeckController(stateAdapter, form, dependencies);
            controller.initialize();

            controller.selectedIndices = new Set([0]);
            controller.handleWingSelect('6');

            expect(controller.selectedWingId).toBe('6');
            expect(controller.selectedIndices.size).toBe(0);
        });
    });
});
