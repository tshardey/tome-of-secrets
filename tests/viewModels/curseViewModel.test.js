/**
 * @jest-environment jsdom
 */

import { createCurseListViewModel } from '../../assets/js/viewModels/curseViewModel.js';

describe('CurseViewModel', () => {
    describe('createCurseListViewModel', () => {
        test('should create view model with empty curses array', () => {
            const viewModel = createCurseListViewModel([], 'Active');
            
            expect(viewModel.curses).toEqual([]);
            expect(viewModel.count).toBe(0);
            expect(viewModel.listType).toBe('Active');
            expect(viewModel.summaryText).toBe('Active Curse Penalties (0)');
        });

        test('should create view model for active curses', () => {
            const curses = [
                { name: 'Curse1', requirement: 'Req1' },
                { name: 'Curse2', requirement: 'Req2' }
            ];
            
            const viewModel = createCurseListViewModel(curses, 'Active');
            
            expect(viewModel.curses).toHaveLength(2);
            expect(viewModel.curses[0]).toEqual({
                curse: curses[0],
                index: 0,
                listType: 'Active'
            });
            expect(viewModel.curses[1]).toEqual({
                curse: curses[1],
                index: 1,
                listType: 'Active'
            });
            expect(viewModel.count).toBe(2);
            expect(viewModel.listType).toBe('Active');
            expect(viewModel.summaryText).toBe('Active Curse Penalties (2)');
        });

        test('should create view model for completed curses', () => {
            const curses = [
                { name: 'Curse1', requirement: 'Req1' }
            ];
            
            const viewModel = createCurseListViewModel(curses, 'Completed');
            
            expect(viewModel.curses).toHaveLength(1);
            expect(viewModel.listType).toBe('Completed');
            expect(viewModel.summaryText).toBe('Completed Curse Penalties (1)');
        });

        test('should handle undefined curses array', () => {
            const viewModel = createCurseListViewModel(undefined, 'Active');
            
            expect(viewModel.curses).toEqual([]);
            expect(viewModel.count).toBe(0);
        });

        test('should preserve curse objects in view model', () => {
            const curse = {
                name: 'The Unread Tome',
                requirement: 'Fail to read a book',
                description: 'A curse description'
            };
            
            const viewModel = createCurseListViewModel([curse], 'Active');
            
            expect(viewModel.curses[0].curse).toBe(curse);
            expect(viewModel.curses[0].curse.name).toBe('The Unread Tome');
        });
    });
});

