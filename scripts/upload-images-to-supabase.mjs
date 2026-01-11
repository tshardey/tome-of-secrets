/**
 * Upload all files under `assets/images/` to a Supabase Storage bucket,
 * preserving the folder structure.
 *
 * No dependencies (uses Node 18+ built-ins).
 *
 * Usage:
 *   SUPABASE_URL="https://<ref>.supabase.co" \
 *   SUPABASE_SERVICE_ROLE_KEY="..." \
 *   node scripts/upload-images-to-supabase.mjs
 *
 * Optional:
 *   SUPABASE_BUCKET="TOME-OF-SECRETS-IMAGES"
 *   LOCAL_IMAGES_DIR="assets/images"
 *   DRY_RUN="1"
 */

import fs from 'node:fs/promises';
import path from 'node:path';

// Bucket IDs in Supabase are commonly lowercase; use the actual bucket id here.
const DEFAULT_BUCKET = 'tome-of-secrets-images';
const DEFAULT_LOCAL_DIR = 'assets/images';

function requiredEnv(name) {
  const v = process.env[name];
  if (!v) throw new Error(`Missing required env var: ${name}`);
  return v;
}

function normalizeBaseUrl(url) {
  return String(url || '').replace(/\/+$/, '');
}

function guessContentType(filename) {
  const ext = path.extname(filename).toLowerCase();
  switch (ext) {
    case '.png':
      return 'image/png';
    case '.jpg':
    case '.jpeg':
      return 'image/jpeg';
    case '.gif':
      return 'image/gif';
    case '.webp':
      return 'image/webp';
    case '.svg':
      return 'image/svg+xml';
    case '.ico':
      return 'image/x-icon';
    default:
      return 'application/octet-stream';
  }
}

async function* walkFiles(dirAbs) {
  const entries = await fs.readdir(dirAbs, { withFileTypes: true });
  for (const entry of entries) {
    const abs = path.join(dirAbs, entry.name);
    if (entry.isDirectory()) {
      yield* walkFiles(abs);
    } else if (entry.isFile()) {
      // Skip common junk
      if (entry.name === '.DS_Store') continue;
      yield abs;
    }
  }
}

async function uploadObject({ supabaseUrl, key, bucket, objectPath, body, contentType, dryRun }) {
  const url = `${supabaseUrl}/storage/v1/object/${encodeURIComponent(bucket)}/${objectPath
    .split('/')
    .map(encodeURIComponent)
    .join('/')}`;

  if (dryRun) {
    console.log(`[dry-run] PUT ${url} (${contentType}, ${body.byteLength} bytes)`);
    return;
  }

  const res = await fetch(url, {
    method: 'PUT',
    headers: {
      authorization: `Bearer ${key}`,
      apikey: key,
      'content-type': contentType,
      // Overwrite if the file already exists.
      'x-upsert': 'true',
    },
    body,
  });

  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`Upload failed (${res.status}) for ${objectPath}: ${text}`);
  }
}

async function listBuckets({ supabaseUrl, key }) {
  const url = `${supabaseUrl}/storage/v1/bucket`;
  const res = await fetch(url, {
    method: 'GET',
    headers: {
      authorization: `Bearer ${key}`,
      apikey: key,
    },
  });

  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`Failed to list buckets (${res.status}): ${text}`);
  }

  const buckets = await res.json();
  if (!Array.isArray(buckets)) return [];
  return buckets;
}

async function main() {
  const supabaseUrl = normalizeBaseUrl(requiredEnv('SUPABASE_URL'));
  const key =
    process.env.SUPABASE_SERVICE_ROLE_KEY ||
    process.env.SUPABASE_ANON_KEY ||
    process.env.SUPABASE_PUBLISHABLE_KEY;

  if (!key) {
    throw new Error(
      'Missing auth key. Set SUPABASE_SERVICE_ROLE_KEY (recommended for uploads) or SUPABASE_ANON_KEY/SUPABASE_PUBLISHABLE_KEY (requires permissive Storage policies).',
    );
  }

  const bucket = process.env.SUPABASE_BUCKET || DEFAULT_BUCKET;
  const localDir = process.env.LOCAL_IMAGES_DIR || DEFAULT_LOCAL_DIR;
  const dryRun = String(process.env.DRY_RUN || '') === '1';

  const localAbs = path.resolve(process.cwd(), localDir);

  console.log(`Supabase URL: ${supabaseUrl}`);
  console.log(`Bucket: ${bucket}`);
  console.log(`Local dir: ${localAbs}`);
  if (dryRun) console.log('DRY_RUN=1 (no uploads will be performed)');

  // Preflight: confirm bucket exists and show helpful output if it doesn't.
  const buckets = await listBuckets({ supabaseUrl, key });
  const bucketIds = buckets
    .map((b) => b?.id || b?.name)
    .filter(Boolean)
    .map(String);

  if (!bucketIds.includes(bucket)) {
    const hint =
      bucketIds.length === 0
        ? 'No buckets were returned. Double-check SUPABASE_URL and that your key has access to Storage.'
        : `Known bucket IDs: ${bucketIds.join(', ')}`;

    throw new Error(
      `Bucket not found: "${bucket}".\n` +
        `${hint}\n` +
        `Set SUPABASE_BUCKET to the exact bucket ID (usually lowercase), e.g.:\n` +
        `  SUPABASE_BUCKET="${bucketIds[0] || 'your-bucket-id'}" node scripts/upload-images-to-supabase.mjs`,
    );
  }

  let uploaded = 0;
  for await (const fileAbs of walkFiles(localAbs)) {
    const relFromImages = path.relative(localAbs, fileAbs).split(path.sep).join('/');
    const objectPath = relFromImages; // bucket root mirrors assets/images/*

    const body = await fs.readFile(fileAbs);
    const contentType = guessContentType(fileAbs);

    await uploadObject({ supabaseUrl, key, bucket, objectPath, body, contentType, dryRun });
    uploaded += 1;

    if (uploaded % 50 === 0) console.log(`Uploaded ${uploaded} files...`);
  }

  console.log(`Done. ${uploaded} file(s) processed.`);
  console.log(
    `If you set images_cdn_base, it should look like:\n  ${supabaseUrl}/storage/v1/object/public/${bucket}`,
  );
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});

