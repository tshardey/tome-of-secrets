function getMetaContent(name) {
  const el = document.querySelector(`meta[name="${name}"]`);
  return el?.getAttribute('content') || '';
}

function normalizeBase(base) {
  if (!base || typeof base !== 'string') return '';
  return base.replace(/\/+$/, '');
}

function isAbsoluteUrl(value) {
  return /^(?:[a-z][a-z0-9+.-]*:)?\/\//i.test(value) || /^(?:data|blob):/i.test(value);
}

function stripLocalImagesPrefix(path) {
  const raw = String(path || '');

  // Common local forms we might encounter.
  // - assets/images/foo.png
  // - /assets/images/foo.png
  // - <baseurl>/assets/images/foo.png
  const baseurl = normalizeBase(getMetaContent('baseurl') || window.__BASEURL || '');
  const prefixes = [
    'assets/images/',
    '/assets/images/',
    `${baseurl}/assets/images/`,
  ].filter(Boolean);

  for (const prefix of prefixes) {
    if (raw.startsWith(prefix)) return raw.slice(prefix.length);
  }

  return raw.replace(/^\/+/, '');
}

export function getImagesCdnBase() {
  const meta = getMetaContent('images-cdn-base');
  const global = typeof window !== 'undefined' ? window.__IMAGES_CDN_BASE : '';
  return normalizeBase(meta || global || '');
}

/**
 * If `images_cdn_base` is configured, rewrite local `assets/images/...` paths
 * to point at the CDN base. Otherwise return the input unchanged.
 */
export function toCdnImageUrlIfConfigured(path) {
  if (!path) return path;
  if (isAbsoluteUrl(path)) return path;

  const cdnBase = getImagesCdnBase();
  if (!cdnBase) return path;

  const subpath = stripLocalImagesPrefix(path);
  return `${cdnBase}/${subpath}`;
}

/**
 * Like `toCdnImageUrlIfConfigured`, but for call sites that historically
 * prepended `window.__BASEURL` for local images (resulting in `/assets/...`).
 */
export function toLocalOrCdnUrl(path, baseurl = (window.__BASEURL || '')) {
  if (!path) return path;
  if (isAbsoluteUrl(path)) return path;

  const cdn = toCdnImageUrlIfConfigured(path);
  if (cdn !== path) return cdn;

  const cleanBase = normalizeBase(baseurl || '');
  const cleanPath = String(path).replace(/^\/+/, '');
  return cleanBase ? `${cleanBase}/${cleanPath}` : `/${cleanPath}`;
}

