# Tome of Secrets

A solo TBR journaling game inspired by an assortment of role playing games.

This project is built as a static website using Jekyll and is hosted on GitHub Pages. This allows the game's rules, which are written in Markdown, to be automatically converted into a navigable website.

---

## Jekyll Website Setup

The website is built from a collection of Markdown files and a few key structural folders and files. Here is a breakdown of the important parts:

* **`_config.yml`**: This is the main configuration file for the Jekyll site. It contains settings like the site's title, description, and the `baseurl` which is crucial for making sure links work correctly on GitHub Pages.

* **`_layouts/default.html`**: This is the master template for the entire site. Every page is built by injecting its content into this layout. It contains the site's overall HTML structure, including the header, the sidebar navigation, the footer, and the links to the CSS and JavaScript files.

* **`assets/`**: This folder contains all the static files for the site.
    * **`css/style.scss`**: This is the main stylesheet that controls the "Dark Academia" look and feel, including colors, fonts, and the layout of all pages.
    * **`js/anchor.js`**: This script automatically adds the "#" anchor links that appear when you hover over headers, making sections easy to share.
    * **`images/`**: This folder contains all the images used on the site, including the main hero banner and the pictures for the reward items.

* **Markdown Pages (`.md`)**: These are the core content files for your game (e.g., `core-mechanics.md`, `dungeons.md`, `rewards.md`, etc.). Each file uses "front matter" at the very top (the part between `---`) to tell Jekyll which layout to use and what the page's title is.

---

## Future Development & How to Update

Making changes to the website is straightforward.

### Editing Content
To edit the text on any page, simply open the corresponding `.md` file and make your changes using standard Markdown syntax. For pages with complex layouts like `dungeons.md` or `rewards.md`, you will be editing HTML directly within the file.

### Adding a New Page
1.  Create a new file in the root directory (e.g., `new-section.md`).
2.  Add the required front matter to the top of the file:
    ```markdown
    ---
    layout: default
    title: Your New Page Title
    ---

    ## Your content starts here...
    ```
3.  Add a link to the new page in the sidebar navigation by editing the list in `_layouts/default.html`.

### Adding New Reward Images
1.  Make sure the image is a reasonable size (e.g., 150x150 pixels).
2.  Add the image file to the `assets/images/rewards/` folder.
3.  Open `rewards.md` and copy an existing `<div class="reward-item">...</div>` block.
4.  Update the `src` in the `<img>` tag to point to your new image file and change the text content.

### Local Development (Optional)
To see your changes live on your own computer before pushing them to GitHub, this project is configured to use **VS Code Dev Containers**. This allows you to run a full-featured development environment in a Docker container, without needing to install Ruby or Jekyll directly on your local machine.

#### Prerequisites

1.  **Visual Studio Code**: Download and install from code.visualstudio.com.
2.  **Docker Desktop**: Download and install from docker.com/products/docker-desktop. Make sure it is running before you proceed.
3.  **Dev Containers extension for VS Code**: Install it from the VS Code Marketplace.

#### Running the Development Environment

1.  **Open the Project in VS Code:** After cloning the repository, open the project folder in VS Code.
2.  **Reopen in Container:** VS Code will detect the `.devcontainer/devcontainer.json` file and show a notification in the bottom-right corner asking if you want to "Reopen in Container". Click it.
    *   If you don't see the notification, open the Command Palette (`Ctrl+Shift+P` or `Cmd+Shift+P`) and type `Dev Containers: Reopen in Container`.
3.  **Wait for the Build:** The first time you do this, Docker will download the necessary image and build the container. This may take a few minutes. Subsequent launches will be much faster.
4.  **Start the Server:** Once the container is running and your VS Code window has reloaded, open the integrated terminal in VS Code (`Ctrl+` or by going to `Terminal > New Terminal`). Then, run the Jekyll server:
    ```bash
    bundle exec jekyll serve
    ```
5.  **View Your Site:** The terminal will show that the server is running. VS Code will automatically forward port 4000 from the container to your local machine. You can now open a web browser and navigate to **`http://localhost:4000`** to see your live site.

Any changes you save to the project files will automatically trigger a rebuild, and you can see the updates by simply refreshing your browser.

---

## Testing

This project uses [Jest](https://jestjs.io/) for JavaScript testing to ensure the interactive functionality of the Character Sheet remains stable.

The development container is already configured with Node.js and npm, so no additional installation is required on your local machine.

### Running the Test Suite

To run the tests, open the integrated terminal in VS Code while inside the devcontainer. All testing-related commands should be run from the `tests` directory.

1.  **Install Dependencies:** The first time you run tests (or after any changes to `package.json`), install the necessary packages:
    ```bash
    cd tests
    npm install
    ```
2.  **Run Tests:** You can then run the entire test suite with:
    ```bash
    npm test
    ```