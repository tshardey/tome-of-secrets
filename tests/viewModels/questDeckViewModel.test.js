/**
 * @jest-environment jsdom
 *
 * Tests for Extra Credit and Restoration deck view models in questDeckViewModel.js
 */

jest.mock('../../assets/js/restoration/wingProgress.js', () => ({
    isWingReadyForRestoration: jest.fn((wingId) => wingId === '6')
}));

jest.mock('../../assets/js/utils/questCardImage.js', () => ({
    getExtraCreditCardImage: jest.fn(() => '/img/extra-credit.png'),
    getExtraCreditCardbackImage: jest.fn(() => '/img/extra-credit-back.png'),
    getRestorationWingCardbackImage: jest.fn((id) => `/img/wing-${id}.png`),
    getRestorationProjectCardFaceImage: jest.fn((id) => `/img/project-${id}.png`)
}));

jest.mock('../../assets/js/character-sheet/data.js', () => ({
    wings: {
        '1': { id: 'scholarly-archives', name: 'The Scholarly Archives', alwaysAccessible: false },
        '6': { id: 'heart-of-library', name: 'Heart of the Library', alwaysAccessible: true }
    },
    restorationProjects: {
        'restore-card-catalog': {
            id: 'restore-card-catalog',
            wingId: '1',
            name: 'Restore the Card Catalog',
            cost: 25,
            description: 'Organize and restore.',
            completionPrompt: 'Read non-fiction.'
        },
        'repair-front-desk': {
            id: 'repair-front-desk',
            wingId: '6',
            name: 'Repair the Front Desk',
            cost: 25,
            description: 'Refinish the desk.',
            completionPrompt: 'Read by BIPOC author.'
        }
    }
}));

import {
    createExtraCreditViewModel,
    createExtraCreditDeckViewModel,
    createRestorationDeckViewModel
} from '../../assets/js/viewModels/questDeckViewModel.js';

describe('questDeckViewModel - Extra Credit and Restoration', () => {
    describe('createExtraCreditViewModel', () => {
        test('returns object with cardImage', () => {
            const vm = createExtraCreditViewModel();
            expect(vm).toEqual({ cardImage: '/img/extra-credit.png' });
        });
    });

    describe('createExtraCreditDeckViewModel', () => {
        test('returns deck and drawnCards with empty drawn list', () => {
            const vm = createExtraCreditDeckViewModel([]);
            expect(vm.deck).toBeDefined();
            expect(vm.deck.available).toBe(true);
            expect(vm.deck.availableCount).toBe(1);
            expect(vm.deck.cardbackImage).toBe('/img/extra-credit-back.png');
            expect(vm.drawnCards).toEqual([]);
        });

        test('maps drawn cards to objects with cardImage', () => {
            const drawn = [
                { cardImage: '/img/extra-credit.png' },
                { cardImage: '/custom.png' }
            ];
            const vm = createExtraCreditDeckViewModel(drawn);
            expect(vm.drawnCards).toHaveLength(2);
            expect(vm.drawnCards[0].cardImage).toBe('/img/extra-credit.png');
            expect(vm.drawnCards[1].cardImage).toBe('/custom.png');
        });

        test('handles non-array drawnCards by treating as empty', () => {
            const vm = createExtraCreditDeckViewModel(null);
            expect(vm.drawnCards).toEqual([]);
        });
    });

    describe('createRestorationDeckViewModel', () => {
        test('returns wings array with unlocked state', () => {
            const state = { completedRestorationProjects: [], dustyBlueprints: 100 };
            const vm = createRestorationDeckViewModel(state, null);
            expect(vm.wings).toBeDefined();
            expect(vm.wings.length).toBe(2);
            const wing6 = vm.wings.find((w) => w.wingId === '6');
            expect(wing6.unlocked).toBe(true);
            const wing1 = vm.wings.find((w) => w.wingId === '1');
            expect(wing1.unlocked).toBe(false);
            expect(vm.wings.every((w) => w.cardbackImage && w.name)).toBe(true);
        });

        test('returns projects for selected wing when affordable', () => {
            const state = { completedRestorationProjects: [], dustyBlueprints: 100 };
            const vm = createRestorationDeckViewModel(state, '6');
            expect(vm.projects).toHaveLength(1);
            expect(vm.projects[0].projectId).toBe('repair-front-desk');
            expect(vm.projects[0].name).toBe('Repair the Front Desk');
            expect(vm.projects[0].cardImage).toBe('/img/project-repair-front-desk.png');
        });

        test('excludes projects already completed', () => {
            const state = { completedRestorationProjects: ['repair-front-desk'], dustyBlueprints: 100 };
            const vm = createRestorationDeckViewModel(state, '6');
            expect(vm.projects).toHaveLength(0);
        });

        test('excludes projects player cannot afford', () => {
            const state = { completedRestorationProjects: [], dustyBlueprints: 10 };
            const vm = createRestorationDeckViewModel(state, '6');
            expect(vm.projects).toHaveLength(0);
        });

        test('returns empty projects when no wing selected', () => {
            const state = { completedRestorationProjects: [], dustyBlueprints: 100 };
            const vm = createRestorationDeckViewModel(state, null);
            expect(vm.projects).toEqual([]);
            expect(vm.selectedWingId).toBeNull();
        });
    });
});
