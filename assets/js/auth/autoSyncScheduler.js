/**
 * Centralized sync scheduler with debouncing and concurrency management.
 * Prevents race conditions and excessive sync requests.
 * 
 * This module coordinates auto-sync triggers from various sources:
 * - Local state changes (form inputs, state mutations)
 * - Cross-tab localStorage changes
 * - Visibility changes (tab becomes visible)
 * - Polling fallback
 * - Manual sync requests
 */

export class AutoSyncScheduler {
    /**
     * @param {Function} syncFn - The sync function to call (should return a Promise)
     * @param {number} debounceMs - Debounce delay in milliseconds (default: 3000)
     */
    constructor(syncFn, debounceMs = 3000) {
        this.syncFn = syncFn;
        this.debounceMs = debounceMs;
        this.debounceTimer = null;
        this.inFlight = false;
    }
    
    /**
     * Request a debounced sync.
     * Multiple rapid calls will be debounced into a single sync.
     * @param {string} reason - Reason for the sync (for logging/debugging)
     */
    requestSync(reason = 'unknown') {
        // Clear existing debounce timer
        if (this.debounceTimer) {
            clearTimeout(this.debounceTimer);
        }
        
        // Schedule debounced sync
        this.debounceTimer = setTimeout(() => {
            this.debounceTimer = null;
            this.executeSync(reason);
        }, this.debounceMs);
    }
    
    /**
     * Execute sync immediately, respecting concurrency guard.
     * @param {string} reason - Reason for the sync (for logging/debugging)
     * @returns {Promise} Promise that resolves when sync completes
     */
    async executeSync(reason) {
        if (this.inFlight) {
            console.log(`[AutoSyncScheduler] Sync skipped (already in flight). Reason: ${reason}`);
            return;
        }
        
        this.inFlight = true;
        try {
            await this.syncFn();
        } finally {
            this.inFlight = false;
        }
    }
    
    /**
     * Flush pending sync (for manual sync button).
     * Cancels any pending debounced sync and executes immediately.
     * @returns {Promise} Promise that resolves when sync completes
     */
    async flushSync() {
        if (this.debounceTimer) {
            clearTimeout(this.debounceTimer);
            this.debounceTimer = null;
        }
        await this.executeSync('manual_flush');
    }
    
    /**
     * Immediate sync (for visibility change).
     * Bypasses debounce to catch stale sessions quickly.
     * @returns {Promise} Promise that resolves when sync completes
     */
    async immediateSync() {
        if (this.debounceTimer) {
            clearTimeout(this.debounceTimer);
            this.debounceTimer = null;
        }
        await this.executeSync('visibility_change');
    }
    
    /**
     * Check if a sync is currently in flight.
     * @returns {boolean} True if sync is in progress
     */
    isInFlight() {
        return this.inFlight;
    }
    
    /**
     * Check if there's a pending debounced sync.
     * @returns {boolean} True if there's a pending sync
     */
    hasPendingSync() {
        return this.debounceTimer !== null;
    }
    
    /**
     * Cancel any pending debounced sync.
     * Useful for cleanup or when sync should be disabled.
     */
    cancelPendingSync() {
        if (this.debounceTimer) {
            clearTimeout(this.debounceTimer);
            this.debounceTimer = null;
        }
    }
}

