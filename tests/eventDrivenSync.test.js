/**
 * @jest-environment jsdom
 */
import { AutoSyncScheduler } from '../assets/js/auth/autoSyncScheduler.js';
import { safeSetJSON } from '../assets/js/utils/storage.js';
import { STORAGE_KEYS } from '../assets/js/character-sheet/storageKeys.js';

describe('Event-Driven Sync Integration', () => {
    let scheduler;
    let syncFn;

    beforeEach(() => {
        jest.useFakeTimers();
        localStorage.clear();
        syncFn = jest.fn().mockResolvedValue({ action: 'push', detail: 'Synced' });
        scheduler = new AutoSyncScheduler(syncFn, 3000);
    });

    afterEach(() => {
        jest.useRealTimers();
        window.removeEventListener('tos:localStateChanged', () => {});
    });

    describe('End-to-end event flow', () => {
        it('should trigger sync after local state change event', async () => {
            // Set up event listener
            const eventHandler = (e) => {
                scheduler.requestSync(`local_change:${e.detail?.source || 'unknown'}`);
            };
            window.addEventListener('tos:localStateChanged', eventHandler);

            // Trigger local state change
            safeSetJSON(STORAGE_KEYS.CHARACTER_SHEET_FORM, { keeperName: 'Test' });

            // Should not have called syncFn yet (debounced)
            expect(syncFn).not.toHaveBeenCalled();

            // Fast-forward past debounce delay
            jest.advanceTimersByTime(3000);
            await Promise.resolve();

            // Should have called syncFn once
            expect(syncFn).toHaveBeenCalledTimes(1);

            window.removeEventListener('tos:localStateChanged', eventHandler);
        });

        it('should debounce multiple rapid state changes', async () => {
            const eventHandler = (e) => {
                scheduler.requestSync(`local_change:${e.detail?.source || 'unknown'}`);
            };
            window.addEventListener('tos:localStateChanged', eventHandler);

            // Trigger multiple rapid changes
            safeSetJSON(STORAGE_KEYS.CHARACTER_SHEET_FORM, { keeperName: 'Test1' });
            safeSetJSON(STORAGE_KEYS.CHARACTER_SHEET_FORM, { keeperName: 'Test2' });
            safeSetJSON(STORAGE_KEYS.CHARACTER_SHEET_FORM, { keeperName: 'Test3' });

            // Fast-forward past debounce delay
            jest.advanceTimersByTime(3000);
            await Promise.resolve();

            // Should have called syncFn only once (debounced)
            expect(syncFn).toHaveBeenCalledTimes(1);

            window.removeEventListener('tos:localStateChanged', eventHandler);
        });

        it('should handle cross-tab storage events', async () => {
            const eventHandler = (e) => {
                if (e.key && e.key === STORAGE_KEYS.CHARACTER_SHEET_FORM) {
                    scheduler.requestSync(`storage_event:${e.key}`);
                }
            };
            window.addEventListener('storage', eventHandler);

            // Simulate storage event from another tab
            const storageEvent = new StorageEvent('storage', {
                key: STORAGE_KEYS.CHARACTER_SHEET_FORM,
                newValue: JSON.stringify({ keeperName: 'From Other Tab' })
            });
            window.dispatchEvent(storageEvent);

            // Fast-forward past debounce delay
            jest.advanceTimersByTime(3000);
            await Promise.resolve();

            // Should have called syncFn once
            expect(syncFn).toHaveBeenCalledTimes(1);

            window.removeEventListener('storage', eventHandler);
        });

        it('should ignore storage events for non-cloud-synced keys', async () => {
            const eventHandler = (e) => {
                if (e.key && e.key === STORAGE_KEYS.CHARACTER_SHEET_FORM) {
                    scheduler.requestSync(`storage_event:${e.key}`);
                }
            };
            window.addEventListener('storage', eventHandler);

            // Simulate storage event for a non-cloud-synced key
            const storageEvent = new StorageEvent('storage', {
                key: 'someUIOnlyKey',
                newValue: JSON.stringify({ some: 'data' })
            });
            window.dispatchEvent(storageEvent);

            // Fast-forward past debounce delay
            jest.advanceTimersByTime(3000);
            await Promise.resolve();

            // Should NOT have called syncFn (key not in allowlist)
            expect(syncFn).not.toHaveBeenCalled();

            window.removeEventListener('storage', eventHandler);
        });
    });

    describe('Loop prevention', () => {
        it('should not emit events when suppressEvents is true', async () => {
            const eventHandler = jest.fn((e) => {
                scheduler.requestSync(`local_change:${e.detail?.source || 'unknown'}`);
            });
            window.addEventListener('tos:localStateChanged', eventHandler);

            // Set with suppressEvents = true (simulating cloud snapshot application)
            safeSetJSON(STORAGE_KEYS.CHARACTER_SHEET_FORM, { keeperName: 'From Cloud' }, true);

            // Fast-forward past debounce delay
            jest.advanceTimersByTime(3000);
            await Promise.resolve();

            // Event should not have been emitted
            expect(eventHandler).not.toHaveBeenCalled();
            // Sync should not have been triggered
            expect(syncFn).not.toHaveBeenCalled();

            window.removeEventListener('tos:localStateChanged', eventHandler);
        });
    });

    describe('Manual sync integration', () => {
        it('should cancel pending auto-sync when manual sync is requested', async () => {
            const eventHandler = (e) => {
                scheduler.requestSync(`local_change:${e.detail?.source || 'unknown'}`);
            };
            window.addEventListener('tos:localStateChanged', eventHandler);

            // Trigger state change (starts debounced sync)
            safeSetJSON(STORAGE_KEYS.CHARACTER_SHEET_FORM, { keeperName: 'Test' });
            expect(scheduler.hasPendingSync()).toBe(true);

            // Cancel pending sync (simulating manual sync button click)
            scheduler.cancelPendingSync();
            expect(scheduler.hasPendingSync()).toBe(false);

            // Fast-forward past debounce delay
            jest.advanceTimersByTime(3000);
            await Promise.resolve();

            // Sync should not have been called (was cancelled)
            expect(syncFn).not.toHaveBeenCalled();

            window.removeEventListener('tos:localStateChanged', eventHandler);
        });

        it('should allow manual sync to execute immediately', async () => {
            const eventHandler = (e) => {
                scheduler.requestSync(`local_change:${e.detail?.source || 'unknown'}`);
            };
            window.addEventListener('tos:localStateChanged', eventHandler);

            // Trigger state change (starts debounced sync)
            safeSetJSON(STORAGE_KEYS.CHARACTER_SHEET_FORM, { keeperName: 'Test' });

            // Manual sync should execute immediately
            await scheduler.flushSync();

            expect(syncFn).toHaveBeenCalledTimes(1);
            expect(scheduler.hasPendingSync()).toBe(false);

            window.removeEventListener('tos:localStateChanged', eventHandler);
        });
    });

    describe('Visibility change integration', () => {
        it('should trigger immediate sync on visibility change', async () => {
            // Simulate tab becoming visible
            Object.defineProperty(document, 'visibilityState', {
                writable: true,
                value: 'visible'
            });

            // Trigger immediate sync (simulating visibility change handler)
            await scheduler.immediateSync();

            expect(syncFn).toHaveBeenCalledTimes(1);
        });

        it('should cancel pending debounced sync on visibility change', async () => {
            const eventHandler = (e) => {
                scheduler.requestSync(`local_change:${e.detail?.source || 'unknown'}`);
            };
            window.addEventListener('tos:localStateChanged', eventHandler);

            // Trigger state change (starts debounced sync)
            safeSetJSON(STORAGE_KEYS.CHARACTER_SHEET_FORM, { keeperName: 'Test' });
            expect(scheduler.hasPendingSync()).toBe(true);

            // Visibility change should cancel pending and execute immediately
            await scheduler.immediateSync();

            expect(syncFn).toHaveBeenCalledTimes(1);
            expect(scheduler.hasPendingSync()).toBe(false);

            window.removeEventListener('tos:localStateChanged', eventHandler);
        });
    });
});

