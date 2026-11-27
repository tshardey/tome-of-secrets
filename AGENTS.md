# Tome of Secrets Agent Guide

This document provides instructions for AI agents on how to interact with, modify, and contribute to the Tome of Secrets repository.

## Project Overview

This repository contains the source code for "Tome of Secrets," a solo TBR (To Be Read) reading game. The project is a static website built using Jekyll and is hosted on GitHub Pages.

The primary components are:
1.  **Game Rules**: A collection of Markdown files that detail the rules and mechanics of the game.
2.  **Interactive Character Sheet**: An HTML page with JavaScript that allows players to manage their character's progress digitally.

## Engineering principles

- **DRY (Don't Repeat Yourself):** Prefer a single source of truth (`assets/data/*.json`, shared services, existing helpers) over copy-pasted rules or parallel implementations. If the same rule appears in two places, consolidate or derive one from the other.
- **Pragmatic testing — not strict TDD:** Write tests where they buy confidence (pure logic, pipelines, regressions, migrations). Do **not** default to test-first for every UI tweak. Match test effort to risk and keep the suite fast enough to run regularly.
- **Frontend engineering:** Follow established patterns in this repo (controllers, StateAdapter, services, view models, pure renderers). Prefer small, reviewable changes; avoid drive-by refactors outside the task.
- **Visual and UX consistency:** New UI should match the existing **Dark Academia** look and feel — reuse classes, spacing, typography, and components from `assets/css/` and existing character-sheet markup. When in doubt, mirror a nearby screen.

## New mechanics and catalog items: TCG modifier pipeline

For **new deterministic bonuses, resources, prevention, activations, and slot unlocks**, follow the **TCG-style modifier pipeline** described in [**ADR-003: TCG Modifier Pipeline**](project-docs/ADR-003-tcg-modifier-pipeline.md).

**Expectation:** Author machine-readable `effects` on the relevant catalog entry in `assets/data/*.json` (see ADR-003 for schema, triggers, and modifier types). The runtime resolves them through `EffectRegistry` and `ModifierPipeline` — avoid adding bespoke branches in calculators or controllers when the pipeline can express the mechanic.

**Dual path (intentional):** Entities with **subjective** or player-judged mechanics may remain on legacy `rewardModifier` / controller flows. When adding content, choose pipeline vs legacy deliberately per ADR-003; do not duplicate the same bonus in both paths.

For hands-on steps (JSON, validation, tests), see [`project-docs/EXTENDING-THE-CODEBASE.md`](project-docs/EXTENDING-THE-CODEBASE.md).

## Subagents

Use **subagents** whenever they reduce context load or parallelize slow work.

- **Pre-commit review (required for code changes):** Before handoff on any **code** change (JavaScript, build scripts, non-trivial HTML/CSS behavior), run a **separate subagent pass** to review the diff for correctness, consistency with ADR-003 and existing patterns, and test gaps. Treat a green review as part of the maintainer’s merge gate alongside automated tests. Purely editorial Markdown copy may skip this if no behavior or data contracts change.
- **Heavy validation:** Delegate **full test suite** or long-running checks to a subagent when the primary session would otherwise block on runtime or output volume. The primary agent should still understand failures and fix them.

## Repository Structure

The repository is organized as a standard Jekyll project.

*   `_config.yml`: The main Jekyll configuration file. Contains site metadata.
*   `_layouts/default.html`: The master HTML template for all pages. It includes the header, footer, and sidebar navigation.
*   `assets/`: Contains all static assets.
    *   `css/`: Stylesheets for the website's "Dark Academia" theme.
    *   `js/`: JavaScript files for site interactivity.
        *   `character-sheet/data.js`: Re-exports auto-generated data from JSON (see `assets/data/`). Some legacy shapes (e.g., `sideQuests`) are derived here from detailed JSON to maintain backward compatibility without duplicating data.
        *   `character-sheet.js`: Main initialization file using controller-based architecture. Orchestrates all feature controllers.
        *   `controllers/`: Feature controllers for character sheet functionality (full list and deck controllers in [`project-docs/EXTENDING-THE-CODEBASE.md`](project-docs/EXTENDING-THE-CODEBASE.md)):
            * `BaseController.js` - Base class with common patterns (event listener cleanup, saveState helper)
            * `CharacterController.js` - Character info changes (level, background, school, sanctum)
            * `AbilityController.js` - Ability learning/forgetting
            * `InventoryController.js` - Inventory/equipment management
            * `QuestController.js` - Quest management (adding, editing, completing, discarding)
            * `BuffController.js` - Temporary and atmospheric buffs
            * `EndOfMonthController.js` - End of month processing
            * …plus deck/draw controllers (dungeon, atmospheric buff, genre quest, side quest decks — see extending guide)
        *   `page-renderers/`: Page hydration modules:
            * `rewardsRenderer.js` (hydrates `rewards.md`)
            * `sanctumRenderer.js` (hydrates `sanctum.md`)
            * `keeperRenderer.js` (hydrates `keeper.md`)
        *   `table-renderer.js`: Renders rules tables for rules pages, and also supports Character Sheet overlays/drawers.
    *   `images/`: All images used on the site.
*   `assets/data/`: JSON source of truth for game data. Edit these files and run the generator to update the site data:
    * `xpLevels.json`, `permanentBonuses.json`, `atmosphericBuffs.json`, `schoolBenefits.json`, `sanctumBenefits.json`, `keeperBackgrounds.json`, `allItems.json`, `dungeonRooms.json`, `masteryAbilities.json`, `dungeonRewards.json`, `dungeonCompletionRewards.json`, `allGenres.json`, `genreQuests.json`, `extraCreditRewards.json`, `sideQuestsDetailed.json`, `temporaryBuffsFromRewards.json`
*   `.md` files (root directory): These are the core content files for the game rules (e.g., `core-mechanics.md`, `rewards.md`). Some previously-standalone rules pages (like quests/leveling) have moved into the Character Sheet UI.
*   `character-sheet.html`: The HTML file for the interactive character sheet.
*   `README.md`: Contains detailed instructions for setting up a local development environment and running tests.
*   `docker-compose.yml` + `docker/`: Docker Compose development environment (`docker/Dockerfile`, entrypoint, Chrome install script) providing Ruby/Jekyll, Node, gh, the Supabase CLI, Chrome and Claude Code.
*   `tests/`: Contains the Jest test suite for the project's JavaScript code, primarily for the character sheet functionality.
*   `supabase/`: Supabase CLI project directory. Contains `config.toml` and `migrations/` with timestamped SQL migration files managed via `supabase migration new` and applied with `supabase db push`.
*   `Gemfile`: Specifies the Ruby gem dependencies for Jekyll.

## Agent Capabilities and Tasks

You can perform the following tasks. Always use the Docker Compose development environment (`docker compose ...`) for running servers or tests.

### 1. Content Management

#### Editing Page Content
1.  Identify the relevant `.md` file in the root directory that corresponds to the page you need to edit.
2.  Modify the content using standard Markdown syntax.
3.  For pages with complex layouts like `rewards.md`, you will be editing HTML directly within the file.
4.  If the changes involve game data (e.g., adding a new reward, changing an ability), update the corresponding JSON in `assets/data/` and run:
    ```
    node scripts/generate-data.js
    ```
    Then, if needed, adjust a renderer (`assets/js/page-renderers/*.js`) or table logic (`assets/js/table-renderer.js`) to reflect the new content.

#### Adding a New Page
1.  Create a new `.md` file in the root directory (e.g., `new-page.md`).
2.  Add the required Jekyll front matter to the top of the file:
    ```markdown
    ---
    layout: default
    title: Your New Page Title
    ---
    ```
3.  Add your content in Markdown below the front matter.
4.  Add a link to the new page in the sidebar navigation by editing the `<ul>` in `_layouts/default.html`.

#### Adding New Reward Items
1.  Ensure the new reward image is placed in the `assets/images/rewards/` directory.
2.  Open `rewards.md` and add a new `<div class="reward-item">...</div>` block, updating the image `src` and description.
3.  **Crucially**, add the item to `assets/data/allItems.json` and run `node scripts/generate-data.js` to update the data exports. The JSON structure should include `type`, `img` path, and `bonus` description.

**Note:** For detailed information about adding new features, extending the codebase, or modifying the character sheet, see [`project-docs/EXTENDING-THE-CODEBASE.md`](project-docs/EXTENDING-THE-CODEBASE.md). This includes information about:
- Adding new game content (items, rewards, quests)
- Adding new persistent state with validation
- Creating new feature controllers
- Schema versioning and migrations
- StateAdapter patterns
- Testing requirements

### 2. Local Development

This project ships a Docker Compose development environment (`docker-compose.yml`, `docker/Dockerfile`). Run `docker compose` from the repository root on the host; Ruby, Node and the other tools live only in the container. Gems and `tests/node_modules` are kept in named volumes, and the container entrypoint installs them and runs `node scripts/generate-data.js` on start.

**To start the local server:**
1.  Build the image the first time (or after changing `docker/`): `docker compose build`.
2.  Make sure `_config.supabase.yml` exists (see below).
3.  Run the command:
    ```bash
    docker compose up jekyll        # add -d to run detached; stop with: docker compose down
    ```
    This runs `bundle exec jekyll serve --config _config.yml,_config.supabase.yml --host 0.0.0.0 --livereload --force_polling` (polling makes auto-regeneration work on a Windows bind mount).

    **Always pass both config files.** `_config.yml` ships `images_cdn_base: ""`, `supabase_url: ""` and the other environment values blank so they are safe to commit; the real values live in `_config.supabase.yml`, which is git-ignored. Serving with `_config.yml` alone builds a site where **every image 404s** (they resolve to repo paths that do not exist — the art is hosted in Supabase Storage, not committed), and cloud sync and Gallery book search are disabled. If a fresh clone has no `_config.supabase.yml`, copy `_config.supabase.yml.example` to that name and fill it in; the `jekyll` service will not start without it.
4.  The site will be available at `http://localhost:4000/tome-of-secrets/`. The server will auto-reload on file changes.
5.  For a shell inside the container use `docker compose run --rm dev` (starts in `tests/`; the repo is at `/workspace`).
6.  To serve a different checkout or worktree, point `TOS_SRC` at it and give it its own project name: `TOS_SRC=../other-worktree docker compose -p tos-other up jekyll` (PowerShell: `$env:TOS_SRC='../other-worktree'; docker compose -p tos-other up jekyll`).
7.  After editing `assets/data/*.json`, restart the `jekyll` service (or run `node scripts/generate-data.js` in a `dev` shell); the entrypoint regenerates the exports only at container start.

**Run Jekyll from the repository root.** If you run `bundle exec jekyll build` by hand inside the container, run it from `/workspace`: it inherits the shell's working directory, so running it after a `cd tests` builds `tests/_site/` and copies every `*.test.js` into it — Jest then discovers the whole suite twice and reports a flood of duplicate failures. If you see the suite count double, delete the stray `_site` directory.

### 3. Testing

The project uses Jest for testing JavaScript functionality.

**To run the test suite** (from the repository root on the host):
```bash
docker compose run --rm dev npm test
```
The container installs test dependencies with `npm ci` automatically when `tests/package-lock.json` changes, so there is no separate install step. `npm run validate-data` and `npm run test:e2e` run the same way.

### 4. Supabase Database Migrations

The project uses the [Supabase CLI](https://supabase.com/docs/guides/local-development/cli) to manage database schema changes. The CLI is pre-installed in the Docker development image; run it from a `docker compose run --rm dev` shell (`cd /workspace` first).

**Setup (one-time per environment):**
1.  Authenticate: `supabase login`
2.  Link to the remote project: `supabase link --project-ref cdhorluhpuchzlnahzlt`

**Creating a new migration:**
```bash
supabase migration new <descriptive-name>
```
This creates a timestamped SQL file in `supabase/migrations/`. Write your DDL there.

**Applying migrations to the remote database:**
```bash
supabase db push
```
This applies any pending migrations that haven't yet run on the remote Supabase project.

**Conventions:**
- Use `IF NOT EXISTS`, `OR REPLACE`, and `DROP ... IF EXISTS` to keep migrations idempotent
- Enable RLS on all new tables; add appropriate policies
- Projection tables (written by server-side triggers) need only `SELECT` policies — no client `INSERT`/`UPDATE` policies
- The `sql/` directory contains legacy migration scripts from before the CLI was set up; canonical migrations now live in `supabase/migrations/`

### 5. Workspace and File Generation

**Constraint:** Be mindful of file generation locations. Some processes may incorrectly generate files or directories in the project root.

*   **Jekyll Build Output**: The `_site` directory is the build output for the Jekyll site. It is generated by `jekyll build` or `jekyll serve`. This directory is correctly ignored by git.
*   **Test-related files**: All test-related files, including `node_modules` for tests, should be confined to the `tests/` directory. If you notice `node_modules` or other test artifacts appearing in the root directory, it is an error.

**Action:** When running `npm install`, ensure you are inside the `tests/` directory first. If you find incorrectly generated files/folders at the root, please clean them up.

## Important Directives

1.  **Data Consistency**: JSON under `assets/data/` is the source of truth. After editing JSON, run `node scripts/generate-data.js`. Hydrated pages (`rewards.md`, `sanctum.md`, `keeper.md`) and the Character Sheet read from the generated exports. Avoid duplicating content in Markdown and JavaScript.
2.  **Development Environment**: All commands for running the server (`jekyll`) or tests (`npm`) MUST be executed inside the Docker Compose environment (`docker compose up jekyll`, `docker compose run --rm dev ...`) to ensure all dependencies are available.
3.  **File Paths**: Use relative paths for links and assets within the project files to ensure they work correctly with Jekyll's `baseurl` configuration (e.g., `{{ site.baseurl }}/assets/css/style.css`).
4.  **Cleanliness**: Do not commit build artifacts or dependencies (`_site`, `node_modules`, `.jekyll-cache`, etc.). The `.gitignore` file should handle this, but be vigilant.
5.  **Git: feature branches only, never `main`:** Agents may **`git add`**, **`git commit`**, **`git push`**, and **open pull requests** — but only on a **feature branch**. Agents must **never** commit to, push to, or merge into **`main`**; the maintainer merges. If the session starts on `main`, create a branch before the first commit.

## Landing the Plane (Session Completion)

**When ending a work session**, complete ALL steps below. Work is complete when intended changes are **committed to a feature branch** (or explicitly listed if something must stay uncommitted), quality gates have run, and the handoff is clear.

**MANDATORY WORKFLOW:**

1. **Note remaining work** - List anything that needs follow-up in the handoff and PR description
2. **Run quality gates** (if code changed) - Tests, linters, builds; complete **subagent pre-commit review** for code diffs
3. **Commit and push the feature branch**:
   ```bash
   git rev-parse --abbrev-ref HEAD                  # confirm you are NOT on main
   git add <paths>     # stage every file that is part of this deliverable
   git status          # show staged vs unstaged; call out anything intentionally not added
   git commit -m "<type>(<scope>): <summary>"
   git push -u origin <feature-branch>
   ```
   Open a PR against `main` when the work is ready for review, and **leave it unmerged**. Never commit or push to `main` directly. The handoff should list the branch, the commits, and the PR link.
4. **Clean up** - Clear stashes if you created them; do not prune remotes unless asked
5. **Verify** - Staged set matches intent; no stray generated artifacts in the index unless the task requires them
6. **Hand off** - Summarize changes, remaining risks, and follow-ups for the next session

**CRITICAL RULES:**
- **Never commit to, push to, or merge into `main`.** Committing, pushing and opening PRs is allowed on **feature branches** only. Check the current branch before your first commit.
- **Do not merge your own PR.** The maintainer reviews and merges.
- Avoid **`git pull` / merge / rebase** unless the maintainer explicitly asked; those change history and can surprise a human mid-review.
- **Parallel agents share one working tree and one git index.** When several agents work the same checkout at once, only one of them may run git commands — the coordinator commits on their behalf. `git add` from two agents at once cross-contaminates the index.
- If the environment prevents staging, still run gates and leave an exact file list and diff summary for the maintainer.
