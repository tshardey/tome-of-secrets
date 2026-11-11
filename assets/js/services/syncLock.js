/**
 * One cloud sync at a time, across every tab of the site.
 *
 * With the Web Locks API the lock is shared by all tabs of the origin, so a tab whose
 * auto-sync was triggered by another tab's write (a `storage` event) waits until that tab
 * has finished, then builds its snapshot. Without it (old browsers, jsdom) the calls of this
 * tab are queued in order.
 *
 * The lock is not re-entrant: never call runExclusiveSync from inside a function it runs.
 */

export const SYNC_LOCK_NAME = 'tos-cloud-sync';

let running = 0;
let tail = Promise.resolve();

function webLocks() {
  if (typeof navigator === 'undefined') return null;
  const locks = navigator.locks;
  return locks && typeof locks.request === 'function' ? locks : null;
}

/**
 * Run fn while holding the sync lock.
 * @template T
 * @param {() => Promise<T>|T} fn
 * @returns {Promise<T>} fn's result; rejects with fn's error (the lock is released either way)
 */
export function runExclusiveSync(fn) {
  const guarded = async () => {
    running += 1;
    try {
      return await fn();
    } finally {
      running -= 1;
    }
  };

  const locks = webLocks();
  if (locks) return locks.request(SYNC_LOCK_NAME, guarded);

  const result = tail.then(guarded);
  tail = result.then(() => {}, () => {});
  return result;
}

/** True while this tab is running a sync inside the lock. */
export function isSyncRunning() {
  return running > 0;
}
