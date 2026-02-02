# Tome of Secrets Agent Guide

This document provides instructions for AI agents on how to interact with, modify, and contribute to the Tome of Secrets repository.

## Project Overview

This repository contains the source code for "Tome of Secrets," a solo TBR (To Be Read) journaling game. The project is a static website built using Jekyll and is hosted on GitHub Pages.

The primary components are:
1.  **Game Rules**: A collection of Markdown files that detail the rules and mechanics of the game.
2.  **Interactive Character Sheet**: An HTML page with JavaScript that allows players to manage their character's progress digitally.

## Repository Structure

The repository is organized as a standard Jekyll project.

*   `_config.yml`: The main Jekyll configuration file. Contains site metadata.
*   `_layouts/default.html`: The master HTML template for all pages. It includes the header, footer, and sidebar navigation.
*   `assets/`: Contains all static assets.
    *   `css/`: Stylesheets for the website's "Dark Academia" theme.
    *   `js/`: JavaScript files for site interactivity.
        *   `character-sheet/data.js`: Re-exports auto-generated data from JSON (see `assets/data/`). Some legacy shapes (e.g., `sideQuests`, `curseTable`) are derived here from detailed JSON to maintain backward compatibility without duplicating data.
        *   `character-sheet.js`: Main initialization file using controller-based architecture. Orchestrates all feature controllers.
        *   `controllers/`: Feature controllers for character sheet functionality:
            * `BaseController.js` - Base class with common patterns (event listener cleanup, saveState helper)
            * `CharacterController.js` - Character info changes (level, background, school, sanctum)
            * `AbilityController.js` - Ability learning/forgetting
            * `InventoryController.js` - Inventory/equipment management
            * `QuestController.js` - Quest management (adding, editing, completing, discarding)
            * `CurseController.js` - Curse functionality
            * `BuffController.js` - Temporary and atmospheric buffs
            * `EndOfMonthController.js` - End of month processing
        *   `page-renderers/`: Page hydration modules:
            * `rewardsRenderer.js` (hydrates `rewards.md`)
            * `sanctumRenderer.js` (hydrates `sanctum.md`)
            * `keeperRenderer.js` (hydrates `keeper.md`)
        *   `table-renderer.js`: Renders rules tables for pages like `shroud.md`, and also supports Character Sheet overlays/drawers.
    *   `images/`: All images used on the site.
*   `assets/data/`: JSON source of truth for game data. Edit these files and run the generator to update the site data:
    * `xpLevels.json`, `permanentBonuses.json`, `atmosphericBuffs.json`, `schoolBenefits.json`, `sanctumBenefits.json`, `keeperBackgrounds.json`, `allItems.json`, `dungeonRooms.json`, `masteryAbilities.json`, `dungeonRewards.json`, `dungeonCompletionRewards.json`, `allGenres.json`, `genreQuests.json`, `extraCreditRewards.json`, `sideQuestsDetailed.json`, `curseTableDetailed.json`, `temporaryBuffsFromRewards.json`
*   `.md` files (root directory): These are the core content files for the game rules (e.g., `core-mechanics.md`, `rewards.md`). Some previously-standalone rules pages (like quests/leveling) have moved into the Character Sheet UI.
*   `character-sheet.html`: The HTML file for the interactive character sheet.
*   `README.md`: Contains detailed instructions for setting up a local development environment and running tests.
*   `.devcontainer/`: Configuration for VS Code Dev Containers, allowing for a consistent development environment.
*   `tests/`: Contains the Jest test suite for the project's JavaScript code, primarily for the character sheet functionality.
*   `Gemfile`: Specifies the Ruby gem dependencies for Jekyll.

## Task Tracking and Planning

Use **[Beads](https://github.com/steveyegge/beads)** (`bd`) for task tracking and planning. Beads is a git-backed, dependency-aware graph issue tracker for coding agents.

**Required workflow:**

1.  **Before starting work:** Create tasks in Beads *before* you begin implementation. Do not start coding (or content changes) until the work is represented as one or more tasks. Use `bd create "Title" -p <priority>` for each discrete piece of work and `bd dep add <child> <parent>` to link dependencies. For multi-step requests, break the work into tasks first, then pick from `bd ready` to see what is unblocked.
2.  **When finished:** Mark tasks complete when the work is done. Close or complete each task you created (or that you were assigned) so that Beads reflects the current state and future sessions see accurate progress.
3.  **Ongoing:** Use `bd ready` to choose next steps; update task state as you go so context persists across sessions.

**Setup and reference:**

*   **Initialization:** If the project does not yet use Beads, run `bd init` in the project root. (Beads is a CLI you install once system-wide; you do not clone the beads repo into this project.)
*   **Commands:** `bd ready` — list tasks with no open blockers; `bd create "Title" -p 0` — create a task; `bd dep add <child> <parent>` — link tasks; `bd show <id>` — view task details. Close/complete tasks via the appropriate `bd` command when work is finished.
*   **Docs:** See [Beads documentation](https://github.com/steveyegge/beads) for installation, agent workflow, and full command reference.

## Agent Capabilities and Tasks

You can perform the following tasks. Always use the local development environment inside the Dev Container for running servers or tests.

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

**Note:** For detailed information about adding new features, extending the codebase, or modifying the character sheet, see [`docs/EXTENDING-THE-CODEBASE.md`](docs/EXTENDING-THE-CODEBASE.md). This includes information about:
- Adding new game content (items, rewards, quests)
- Adding new persistent state with validation
- Creating new feature controllers
- Schema versioning and migrations
- StateAdapter patterns
- Testing requirements

### 2. Local Development

This project is configured to use VS Code Dev Containers. All development and testing commands should be run from within the container's terminal.

**To start the local server:**
1.  Ensure the Dev Container is running.
2.  Open a terminal in VS Code.
3.  Run the command:
    ```bash
    bundle exec jekyll serve
    ```
4.  The site will be available at `http://localhost:4000`. The server will auto-reload on file changes.

### 3. Testing

The project uses Jest for testing JavaScript functionality.

**To run the test suite:**
1.  Navigate to the `tests` directory:
    ```bash
    cd tests
    ```
2.  If it's the first time or `package.json` has changed, install dependencies:
    ```bash
    cd tests && npm install
    ```
3.  Run the tests:
    ```bash
    cd tests && npm test
    ```

### 4. Workspace and File Generation

**Constraint:** Be mindful of file generation locations. Some processes may incorrectly generate files or directories in the project root.

*   **Jekyll Build Output**: The `_site` directory is the build output for the Jekyll site. It is generated by `jekyll build` or `jekyll serve`. This directory is correctly ignored by git.
*   **Test-related files**: All test-related files, including `node_modules` for tests, should be confined to the `tests/` directory. If you notice `node_modules` or other test artifacts appearing in the root directory, it is an error.

**Action:** When running `npm install`, ensure you are inside the `tests/` directory first. If you find incorrectly generated files/folders at the root, please clean them up.

## Important Directives

1.  **Task tracking (Beads):** Create tasks in Beads *before* starting work and mark them complete when finished. Do not begin implementation until the work is represented as tasks; close or complete those tasks when done.
2.  **Data Consistency**: JSON under `assets/data/` is the source of truth. After editing JSON, run `node scripts/generate-data.js`. Hydrated pages (`rewards.md`, `sanctum.md`, `keeper.md`, `shroud.md`) and the Character Sheet read from the generated exports. Avoid duplicating content in Markdown and JavaScript.
3.  **Development Environment**: All commands for running the server (`jekyll`) or tests (`npm`) MUST be executed from within the VS Code Dev Container environment to ensure all dependencies are available.
4.  **File Paths**: Use relative paths for links and assets within the project files to ensure they work correctly with Jekyll's `baseurl` configuration (e.g., `{{ site.baseurl }}/assets/css/style.css`).
5.  **Cleanliness**: Do not commit build artifacts or dependencies (`_site`, `node_modules`, `.jekyll-cache`, etc.). The `.gitignore` file should handle this, but be vigilant.

## Landing the Plane (Session Completion)

**When ending a work session**, you MUST complete ALL steps below. Work is NOT complete until `git push` succeeds.

**MANDATORY WORKFLOW:**

1. **File issues for remaining work** - Create issues for anything that needs follow-up
2. **Run quality gates** (if code changed) - Tests, linters, builds
3. **Update issue status** - Close finished work, update in-progress items
4. **PUSH TO REMOTE** - This is MANDATORY:
   ```bash
   git pull --rebase
   bd sync
   git push
   git status  # MUST show "up to date with origin"
   ```
5. **Clean up** - Clear stashes, prune remote branches
6. **Verify** - All changes committed AND pushed
7. **Hand off** - Provide context for next session

**CRITICAL RULES:**
- Work is NOT complete until `git push` succeeds
- NEVER stop before pushing - that leaves work stranded locally
- NEVER say "ready to push when you are" - YOU must push
- If push fails, resolve and retry until it succeeds
