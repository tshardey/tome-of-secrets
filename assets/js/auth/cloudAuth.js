import { getBaseUrl, getSupabaseConfig } from '../services/siteConfig.js';
import { getLastSyncedAt, getLastSyncedSource, syncAuto, syncNow } from '../services/cloudSync.js';
import { AutoSyncScheduler } from './autoSyncScheduler.js';
import { STORAGE_KEYS, CHARACTER_STATE_KEYS } from '../character-sheet/storageKeys.js';
import { LARGE_STATE_KEYS } from '../character-sheet/persistence.js';

async function loadSupabase() {
  // Dynamic import so Jest/tests (and pages that don't need auth) don't try to resolve a CDN module.
  const mod = await import('https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.49.1/+esm');
  return mod;
}

function getRedirectTo() {
  // For magic links, Supabase is very strict: `emailRedirectTo` must be allowlisted
  // and should match the current environment (localhost vs production).
  //
  // Using the exact current page URL (minus hash) avoids baseurl/path mismatches
  // when running locally with a GitHub Pages `baseurl` configured.
  const url = new URL(window.location.href);
  url.hash = '';
  return url.toString();
}

function el(id) {
  return document.getElementById(id);
}

function setText(id, text) {
  const node = el(id);
  if (node) node.textContent = text;
}

function setHint(text) {
  setText('auth-hint', text);
}

function setMeta(text) {
  setText('auth-last-sync', text);
}

function setEnabled(id, enabled) {
  const node = el(id);
  if (node) node.disabled = !enabled;
}

function formatAuthError(e) {
  const raw =
    (e && typeof e === 'object' && 'message' in e && e.message)
      ? String(e.message)
      : String(e);

  // Browser network errors are often opaque. Provide a human hint.
  const looksLikeNetworkError =
    raw.includes('Failed to fetch') ||
    raw.includes('NetworkError') ||
    raw.includes('Load failed') ||
    raw.includes('The Internet connection appears to be offline');

  if (looksLikeNetworkError) {
    const offlineHint = (typeof navigator !== 'undefined' && navigator.onLine === false)
      ? 'You appear to be offline.'
      : 'This looks like a network error.';

    return `${offlineHint} Make sure you’re connected to the internet (and DevTools “Offline” is disabled), then try again.`;
  }

  return raw;
}

export async function initializeCloudAuth() {
  const panel = el('auth-panel');
  if (!panel) return;

  const { url, publishableKey } = getSupabaseConfig();
  const configured = Boolean(url) && Boolean(publishableKey);

  if (!configured) {
    setText('auth-status', 'Cloud save disabled');
    setHint('Set Supabase config in _config.yml (supabase_url and supabase_publishable_key), then restart Jekyll to enable cloud save.');
    setEnabled('auth-sign-in', false);
    setEnabled('auth-sync-now', false);
    setEnabled('auth-sign-out', false);
    return;
  }

  const { createClient } = await loadSupabase();
  const supabase = createClient(url, publishableKey);

  const signInBtn = el('auth-sign-in');
  const syncBtn = el('auth-sync-now');
  const signOutBtn = el('auth-sign-out');
  const emailInput = el('auth-email');

  setEnabled('auth-sign-in', true);

  let autoSyncTimer = null;
  let autoSyncVisibilityHandler = null;
  let autoSyncStorageHandler = null;
  let autoSyncLocalStateHandler = null;
  let syncScheduler = null;
  let lastAutoStatus = '';
  let syncInProgress = false; // Shared flag to prevent concurrent manual and auto syncs
  
  // Allowlist for storage event filtering (localStorage keys that trigger sync)
  const CLOUD_SYNCED_KEYS = new Set([
    STORAGE_KEYS.CHARACTER_SHEET_FORM,
    STORAGE_KEYS.MONTHLY_COMPLETED_BOOKS,
    // Small character state keys (not in LARGE_STATE_KEYS, stored in localStorage)
    ...CHARACTER_STATE_KEYS.filter(key => !LARGE_STATE_KEYS.has(key))
  ]);

  function updateLastSyncedUI() {
    const at = getLastSyncedAt();
    const source = getLastSyncedSource();
    if (!at) {
      setMeta('');
      return;
    }
    const when = new Date(at);
    const label = isNaN(when.getTime()) ? at : when.toLocaleString();
    const sourceLabel = source ? ` (${source})` : '';
    setMeta(`Last synced: ${label}${sourceLabel}`);
  }

  async function runAutoSyncOnce() {
    // Prevent auto-sync if manual sync is in progress
    if (syncInProgress) {
      console.log('[AutoSync] Sync skipped (manual sync in progress)');
      return;
    }
    
    syncInProgress = true;
    try {
      const result = await syncAuto(supabase);
      // Only surface useful info; avoid spamming.
      if (result.action === 'push') {
        setHint('Auto-synced to cloud.');
        updateLastSyncedUI();
        lastAutoStatus = 'push';
      } else if (result.action === 'pull') {
        // Safe auto-pull only happens when local is unchanged since last sync.
        setHint('Auto-pulled newer cloud save. Reload recommended to refresh the UI.');
        updateLastSyncedUI();
        lastAutoStatus = 'pull';
      } else if (result.action === 'manual_required') {
        // Nudge once per state to avoid spam.
        if (lastAutoStatus !== 'manual_required') {
          setHint(`${result.detail}`);
          lastAutoStatus = 'manual_required';
        }
      }
    } catch (e) {
      console.error(e);
      // Don't spam errors; just show a gentle message.
      if (lastAutoStatus !== 'error') {
        setHint(`Auto-sync paused: ${formatAuthError(e)}`);
        lastAutoStatus = 'error';
      }
    } finally {
      syncInProgress = false;
    }
  }

  function startAutoSync() {
    // Prevent duplicate listeners: check if scheduler already exists
    if (syncScheduler) return;
    
    // Create sync scheduler with 3 second debounce
    syncScheduler = new AutoSyncScheduler(runAutoSyncOnce, 3000);
    
    // Event-driven sync: local state changes
    autoSyncLocalStateHandler = (e) => {
      syncScheduler.requestSync(`local_change:${e.detail?.source || 'unknown'}`);
    };
    window.addEventListener('tos:localStateChanged', autoSyncLocalStateHandler);
    
    // Cross-tab localStorage changes
    autoSyncStorageHandler = (e) => {
      if (e.key && CLOUD_SYNCED_KEYS.has(e.key)) {
        syncScheduler.requestSync(`storage_event:${e.key}`);
      }
    };
    window.addEventListener('storage', autoSyncStorageHandler);
    
    // Visibility change: immediate sync (catches stale sessions)
    autoSyncVisibilityHandler = () => {
      if (document.visibilityState === 'visible' && syncScheduler) {
        void syncScheduler.immediateSync();
      }
    };
    document.addEventListener('visibilitychange', autoSyncVisibilityHandler);
    
    // Fallback polling: reduced frequency (3 minutes) for edge cases
    autoSyncTimer = window.setInterval(() => {
      if (syncScheduler) {
        syncScheduler.requestSync('polling_fallback');
      }
    }, 180_000); // 3 minutes
  }

  function stopAutoSync() {
    if (autoSyncTimer) {
      window.clearInterval(autoSyncTimer);
      autoSyncTimer = null;
    }
    if (autoSyncVisibilityHandler) {
      document.removeEventListener('visibilitychange', autoSyncVisibilityHandler);
      autoSyncVisibilityHandler = null;
    }
    if (autoSyncStorageHandler) {
      window.removeEventListener('storage', autoSyncStorageHandler);
      autoSyncStorageHandler = null;
    }
    if (autoSyncLocalStateHandler) {
      window.removeEventListener('tos:localStateChanged', autoSyncLocalStateHandler);
      autoSyncLocalStateHandler = null;
    }
    if (syncScheduler) {
      syncScheduler.cancelPendingSync();
      syncScheduler = null;
    }
  }

  async function refreshUI() {
    const { data } = await supabase.auth.getSession();
    const session = data?.session || null;

    if (!session) {
      setText('auth-status', 'Signed out');
      setHint('Enter your email to get a magic link for cloud sync.');
      setMeta('');
      setEnabled('auth-sync-now', false);
      setEnabled('auth-sign-out', false);
      stopAutoSync();
      return;
    }

    const username = session.user?.user_metadata?.user_name || session.user?.email || 'Signed in';
    setText('auth-status', `Signed in as ${username}`);
    setHint('Sync writes a single “cloud save” per account. Local-first; you can keep playing offline.');
    updateLastSyncedUI();
    setEnabled('auth-sync-now', true);
    setEnabled('auth-sign-out', true);
    startAutoSync();
  }

  signInBtn?.addEventListener('click', async () => {
    try {
      const email = (emailInput?.value || '').trim();
      if (!email) {
        setHint('Enter an email address first.');
        return;
      }

      setHint('Sending magic link… check your email.');
      const emailRedirectTo = getRedirectTo();
      const { error } = await supabase.auth.signInWithOtp({
        email,
        options: { emailRedirectTo }
      });
      if (error) throw error;

      setHint('Magic link sent. Open it to finish signing in, then come back and click “Sync now”.');
    } catch (e) {
      console.error(e);
      setHint(`Failed to send magic link: ${formatAuthError(e)}`);
    }
  });

  signOutBtn?.addEventListener('click', async () => {
    try {
      await supabase.auth.signOut();
      await refreshUI();
    } catch (e) {
      console.error(e);
      setHint('Failed to sign out. Check console.');
    }
  });

  syncBtn?.addEventListener('click', async () => {
    try {
      setHint('Syncing…');
      
      // Cancel any pending debounced auto-sync (manual sync takes priority)
      if (syncScheduler) {
        syncScheduler.cancelPendingSync();
      }
      
      // Wait for any in-progress sync to complete before starting manual sync
      // This prevents race conditions where auto-sync and manual sync run concurrently
      while (syncInProgress) {
        await new Promise(resolve => setTimeout(resolve, 100)); // Poll every 100ms
      }
      
      // Set flag to prevent auto-sync from running concurrently
      syncInProgress = true;
      
      try {
        // Run manual sync (can prompt for conflicts)
        const result = await syncNow(supabase);
        setHint(result.detail + (result.action === 'pull' ? ' Reload the page to apply UI updates.' : ''));
        updateLastSyncedUI();
        if (result.action === 'pull') {
          // The underlying storage is updated; a reload is the simplest way to refresh all controllers/pages.
          // Give the user a moment to read the hint.
          setTimeout(() => window.location.reload(), 250);
        }
      } finally {
        // Always clear the flag, even if sync fails
        syncInProgress = false;
      }
    } catch (e) {
      console.error(e);
      setHint(`Sync failed: ${formatAuthError(e)}`);
      syncInProgress = false; // Ensure flag is cleared on error
    }
  });

  supabase.auth.onAuthStateChange(() => {
    void refreshUI();
  });

  // Initial UI state
  await refreshUI();
}


