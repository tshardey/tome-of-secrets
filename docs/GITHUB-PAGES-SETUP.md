# GitHub Pages Deployment Setup

## Important: Configure GitHub Pages to Use GitHub Actions

Since `data.json-exports.js` is auto-generated (and should NOT be committed to git), you must configure GitHub Pages to use GitHub Actions for building and deployment.

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

