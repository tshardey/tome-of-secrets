function readMeta(name) {
  const el = document.querySelector(`meta[name="${name}"]`);
  if (!el) return '';
  return (el.content || '').trim();
}

export function getBaseUrl() {
  return readMeta('baseurl');
}

export function getSupabaseConfig() {
  const publishableKey = readMeta('supabase-publishable-key');
  const legacyAnonKey = readMeta('supabase-anon-key');
  return {
    url: readMeta('supabase-url'),
    // Supabase UI renamed anon -> publishable. Prefer publishable but keep legacy support.
    publishableKey: publishableKey || legacyAnonKey
  };
}


