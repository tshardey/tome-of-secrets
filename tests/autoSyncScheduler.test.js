/**
 * @jest-environment jsdom
 */
import { AutoSyncScheduler } from '../assets/js/auth/autoSyncScheduler.js';

describe('AutoSyncScheduler', () => {
    let scheduler;
    let syncFn;

    beforeEach(() => {
        jest.useFakeTimers();
        syncFn = jest.fn().mockResolvedValue(undefined);
        scheduler = new AutoSyncScheduler(syncFn, 3000);
    });

    afterEach(() => {
        jest.useRealTimers();
    });

    describe('requestSync', () => {
        it('should debounce multiple rapid requests into a single sync', async () => {
            scheduler.requestSync('test1');
            scheduler.requestSync('test2');
            scheduler.requestSync('test3');

            // Should not have called syncFn yet
            expect(syncFn).not.toHaveBeenCalled();

            // Fast-forward past debounce delay
            jest.advanceTimersByTime(3000);

            // Should have called syncFn exactly once
            expect(syncFn).toHaveBeenCalledTimes(1);
        });

        it('should reset debounce timer on new requests', async () => {
            scheduler.requestSync('test1');

            // Advance 2 seconds (not enough to trigger)
            jest.advanceTimersByTime(2000);
            expect(syncFn).not.toHaveBeenCalled();

            // New request should reset timer
            scheduler.requestSync('test2');

            // Advance 2 more seconds (total 4, but timer was reset at 2)
            jest.advanceTimersByTime(2000);
            expect(syncFn).not.toHaveBeenCalled();

            // Advance 1 more second (3 seconds from last request)
            jest.advanceTimersByTime(1000);
            expect(syncFn).toHaveBeenCalledTimes(1);
        });

        it('should call syncFn with correct context', async () => {
            scheduler.requestSync('test_reason');
            jest.advanceTimersByTime(3000);

            expect(syncFn).toHaveBeenCalledTimes(1);
        });
    });

    describe('executeSync', () => {
        it('should execute sync immediately', async () => {
            await scheduler.executeSync('immediate');

            expect(syncFn).toHaveBeenCalledTimes(1);
        });

        it('should prevent concurrent syncs', async () => {
            // Start a sync that takes time
            let resolveSlowSync;
            const slowSync = jest.fn().mockImplementation(() => {
                return new Promise(resolve => {
                    resolveSlowSync = resolve;
                });
            });
            scheduler.syncFn = slowSync;

            // Start first sync
            const promise1 = scheduler.executeSync('sync1');
            
            // Verify first sync is in flight
            expect(scheduler.isInFlight()).toBe(true);
            
            // Try to start second sync while first is in flight
            const promise2 = scheduler.executeSync('sync2');

            // Second sync should be skipped (already in flight)
            expect(slowSync).toHaveBeenCalledTimes(1);

            // Resolve the first sync
            resolveSlowSync();
            await promise1;
            await promise2;

            // Should only have called syncFn once (second call was skipped)
            expect(slowSync).toHaveBeenCalledTimes(1);
        });

        it('should reset inFlight flag after sync completes', async () => {
            expect(scheduler.isInFlight()).toBe(false);

            const promise = scheduler.executeSync('test');
            expect(scheduler.isInFlight()).toBe(true);

            await promise;
            expect(scheduler.isInFlight()).toBe(false);
        });

        it('should reset inFlight flag even if sync fails', async () => {
            const failingSync = jest.fn().mockRejectedValue(new Error('Sync failed'));
            scheduler.syncFn = failingSync;

            expect(scheduler.isInFlight()).toBe(false);

            try {
                await scheduler.executeSync('test');
            } catch (e) {
                // Expected to fail
            }

            expect(scheduler.isInFlight()).toBe(false);
        });
    });

    describe('flushSync', () => {
        it('should cancel pending debounced sync and execute immediately', async () => {
            scheduler.requestSync('test');

            // Should not have called syncFn yet
            expect(syncFn).not.toHaveBeenCalled();

            // Flush should execute immediately
            await scheduler.flushSync();

            expect(syncFn).toHaveBeenCalledTimes(1);
        });

        it('should execute immediately even if no pending sync', async () => {
            await scheduler.flushSync();

            expect(syncFn).toHaveBeenCalledTimes(1);
        });

        it('should cancel pending sync when flush is called', async () => {
            scheduler.requestSync('test');
            expect(scheduler.hasPendingSync()).toBe(true);

            await scheduler.flushSync();

            expect(scheduler.hasPendingSync()).toBe(false);
            expect(syncFn).toHaveBeenCalledTimes(1);
        });
    });

    describe('immediateSync', () => {
        it('should execute sync immediately bypassing debounce', async () => {
            scheduler.requestSync('test');

            // Should not have called syncFn yet
            expect(syncFn).not.toHaveBeenCalled();

            // Immediate sync should execute right away
            await scheduler.immediateSync();

            expect(syncFn).toHaveBeenCalledTimes(1);
        });

        it('should cancel pending debounced sync', async () => {
            scheduler.requestSync('test');
            expect(scheduler.hasPendingSync()).toBe(true);

            await scheduler.immediateSync();

            expect(scheduler.hasPendingSync()).toBe(false);
        });
    });

    describe('isInFlight', () => {
        it('should return false when no sync is in progress', () => {
            expect(scheduler.isInFlight()).toBe(false);
        });

        it('should return true when sync is in progress', async () => {
            let resolveSlowSync;
            const slowSync = jest.fn().mockImplementation(() => {
                return new Promise(resolve => {
                    resolveSlowSync = resolve;
                });
            });
            scheduler.syncFn = slowSync;

            const promise = scheduler.executeSync('test');
            expect(scheduler.isInFlight()).toBe(true);

            // Resolve the sync
            resolveSlowSync();
            await promise;
            expect(scheduler.isInFlight()).toBe(false);
        });
    });

    describe('hasPendingSync', () => {
        it('should return false when no sync is pending', () => {
            expect(scheduler.hasPendingSync()).toBe(false);
        });

        it('should return true when debounced sync is pending', () => {
            scheduler.requestSync('test');
            expect(scheduler.hasPendingSync()).toBe(true);
        });

        it('should return false after debounce timer fires', async () => {
            scheduler.requestSync('test');
            expect(scheduler.hasPendingSync()).toBe(true);

            jest.advanceTimersByTime(3000);
            await Promise.resolve(); // Wait for timer callback

            expect(scheduler.hasPendingSync()).toBe(false);
        });
    });

    describe('cancelPendingSync', () => {
        it('should cancel pending debounced sync', () => {
            scheduler.requestSync('test');
            expect(scheduler.hasPendingSync()).toBe(true);

            scheduler.cancelPendingSync();

            expect(scheduler.hasPendingSync()).toBe(false);
            expect(syncFn).not.toHaveBeenCalled();
        });

        it('should not throw if no pending sync', () => {
            expect(() => scheduler.cancelPendingSync()).not.toThrow();
        });
    });
});

