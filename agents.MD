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
        *   `page-renderers/`: Page hydration modules:
            * `rewardsRenderer.js` (hydrates `rewards.md`)
            * `sanctumRenderer.js` (hydrates `sanctum.md`)
            * `keeperRenderer.js` (hydrates `keeper.md`)
        *   `table-renderer.js`: Renders rules tables for `dungeons.md`, `quests.md`, `shroud.md`, and auto-linkifies item names.
    *   `images/`: All images used on the site.
*   `assets/data/`: JSON source of truth for game data. Edit these files and run the generator to update the site data:
    * `xpLevels.json`, `permanentBonuses.json`, `atmosphericBuffs.json`, `schoolBenefits.json`, `sanctumBenefits.json`, `keeperBackgrounds.json`, `allItems.json`, `dungeonRooms.json`, `masteryAbilities.json`, `dungeonRewards.json`, `dungeonCompletionRewards.json`, `allGenres.json`, `genreQuests.json`, `extraCreditRewards.json`, `sideQuestsDetailed.json`, `curseTableDetailed.json`, `temporaryBuffsFromRewards.json`
*   `.md` files (root directory): These are the core content files for the game rules (e.g., `core-mechanics.md`, `quests.md`, `rewards.md`). Some of these files contain a mix of Markdown and direct HTML for layout purposes.
*   `character-sheet.html`: The HTML file for the interactive character sheet.
*   `README.md`: Contains detailed instructions for setting up a local development environment and running tests.
*   `.devcontainer/`: Configuration for VS Code Dev Containers, allowing for a consistent development environment.
*   `tests/`: Contains the Jest test suite for the project's JavaScript code, primarily for the character sheet functionality.
*   `Gemfile`: Specifies the Ruby gem dependencies for Jekyll.

## Agent Capabilities and Tasks

You can perform the following tasks. Always use the local development environment inside the Dev Container for running servers or tests.

### 1. Content Management

#### Editing Page Content
1.  Identify the relevant `.md` file in the root directory that corresponds to the page you need to edit.
2.  Modify the content using standard Markdown syntax.
3.  For pages with complex layouts like `dungeons.md` or `rewards.md`, you will be editing HTML directly within the file.
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
3.  **Crucially**, open `assets/js/character-sheet/data.js` and add a new entry to the `allItems` object. The key should be the item's name, and the value should be an object with its `type`, `img` path, and `bonus` description.

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

1.  **Data Consistency**: JSON under `assets/data/` is the source of truth. After editing JSON, run `node scripts/generate-data.js`. Hydrated pages (`rewards.md`, `sanctum.md`, `keeper.md`, `shroud.md`) and the Character Sheet read from the generated exports. Avoid duplicating content in Markdown and JavaScript.
2.  **Development Environment**: All commands for running the server (`jekyll`) or tests (`npm`) MUST be executed from within the VS Code Dev Container environment to ensure all dependencies are available.
3.  **File Paths**: Use relative paths for links and assets within the project files to ensure they work correctly with Jekyll's `baseurl` configuration (e.g., `{{ site.baseurl }}/assets/css/style.css`).
4.  **Cleanliness**: Do not commit build artifacts or dependencies (`_site`, `node_modules`, `.jekyll-cache`, etc.). The `.gitignore` file should handle this, but be vigilant.

