# GitHub Pages Deployment Setup

## ⚠️ Important: Prevent Dual Deployment

**You can only use ONE deployment method at a time:**

1. **Native Jekyll Build** (simpler, but requires committing `data.json-exports.js`)
2. **GitHub Actions Workflow** (more control, generates file automatically)

**If you currently see the site deployed and working**, check which method is active in Repository Settings → Pages → Source.

## Option 1: Use GitHub Actions (Current Setup)

Since `data.json-exports.js` is auto-generated (and is in `.gitignore`), you must configure GitHub Pages to use GitHub Actions for building and deployment.

### Setup Steps

1. **Go to your repository settings** on GitHub
2. **Navigate to Pages** (Settings → Pages)
3. **Under "Source"**, select **"GitHub Actions"** (not "Deploy from a branch")
4. **Save the changes**

### What This Does

The `.github/workflows/jekyll.yml` workflow will:

1. ✅ Generate `data.json-exports.js` from JSON files using `node scripts/generate-data.js`
2. ✅ Build the Jekyll site (which includes the generated file)
3. ✅ Deploy to GitHub Pages

It can also inject environment-specific configuration at build time (e.g., Supabase Cloud Save, Google Books API for the Gallery), without committing credentials to git.

### Repository secrets (optional)

To enable features that need API keys in production, add these in **Settings → Secrets and variables → Actions**:

| Secret name | Used for |
|-------------|----------|
| `SUPABASE_URL` | Cloud Save (Supabase project URL) |
| `SUPABASE_PUBLISHABLE_KEY` | Cloud Save (Supabase anon/publishable key) |
| `IMAGES_CDN_BASE` | Optional images CDN base URL |
| `GOOGLE_BOOKS_API_KEY` | Gallery book search (Google Books API). Restrict the key to your GitHub Pages origin and (optionally) `localhost` in Google Cloud Console. |

After adding or changing secrets, re-run the workflow or push a commit so the next build picks them up.

**Local development (Gallery):** To use the Google Books API when running Jekyll locally, add `google_books_api_key: "your-key-here"` to your existing `_config.supabase.yml` (same file you use for Supabase). You can copy the value from `.devcontainer/.env` (`GOOGLE_BOOKS_API_KEY`). Do not commit secrets.

### Why This Is Necessary

- `data.json-exports.js` is **auto-generated** and should not be committed to git
- The file must exist when Jekyll builds the site
- GitHub Actions generates it **before** the Jekyll build runs
- The generated file is included in the `_site` output and deployed

### Verification

After configuring GitHub Pages to use Actions:

1. Push a commit to `main` branch
2. Check the "Actions" tab - you should see a workflow running
3. The workflow will generate the file, build Jekyll, and deploy

### Troubleshooting

- **404 error for data.json-exports.js**: Ensure GitHub Pages is set to use "GitHub Actions" not "Deploy from a branch"
- **Workflow not running**: Check that the workflow file is in `.github/workflows/` and committed to `main`
- **Build failing**: Check Actions logs to see if Node.js or Jekyll build is failing
- **Two deployments happening**: If you see duplicate builds, ensure GitHub Pages Source is set to "GitHub Actions" (not a branch)

## Option 2: Use Native Jekyll Build (Simpler Alternative)

If you prefer to use GitHub Pages' native Jekyll build (simpler, no workflow needed):

1. **Remove the GitHub Actions workflow**: Delete `.github/workflows/jekyll.yml`
1. **Remove from .gitignore**: Remove `assets/js/character-sheet/data.json-exports.js` from `.gitignore`
1. **Generate and commit the file**:

```bash
node scripts/generate-data.js
git add assets/js/character-sheet/data.json-exports.js
git commit -m "Add generated data exports file"
```

1. **Configure GitHub Pages**: In Repository Settings → Pages → Source, select your branch (e.g., `main` or `gh-pages`)

**Note:** You'll need to manually regenerate and commit `data.json-exports.js` whenever you edit JSON files in `assets/data/`.
