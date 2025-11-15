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
2. **Remove from .gitignore**: Remove `assets/js/character-sheet/data.json-exports.js` from `.gitignore`
3. **Generate and commit the file**:
   ```bash
   node scripts/generate-data.js
   git add assets/js/character-sheet/data.json-exports.js
   git commit -m "Add generated data exports file"
   ```
4. **Configure GitHub Pages**: In Repository Settings → Pages → Source, select your branch (e.g., `main` or `gh-pages`)

**Note:** You'll need to manually regenerate and commit `data.json-exports.js` whenever you edit JSON files in `assets/data/`.

