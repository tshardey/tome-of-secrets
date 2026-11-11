import { getSupabaseConfig } from './siteConfig.js';

let clientPromise = null;

// Pinned build (2.49.1); its SupabaseClient has schema(), which the library catalogue uses.
async function loadSupabase() {
  // Dynamic import so Jest/tests (and pages that don't need auth) don't try to resolve a CDN module.
  return await import('https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.49.1/+esm');
}

/**
 * The page's one Supabase client, shared by cloud save and the household library so both use
 * one auth session (storage key sb-<ref>-auth-token).
 * @returns {Promise<Object|null>} the client, or null when Supabase is not configured.
 *   Rejects when the library cannot be loaded (e.g. offline); the next call tries again.
 */
export function getSupabaseClient() {
  if (clientPromise) return clientPromise;
  const { url, publishableKey } = getSupabaseConfig();
  if (!url || !publishableKey) return Promise.resolve(null);
  clientPromise = loadSupabase()
    .then(({ createClient }) => createClient(url, publishableKey))
    .catch((error) => {
      clientPromise = null;
      throw error;
    });
  return clientPromise;
}

