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
To see your changes live on your own computer before pushing them to GitHub, you can set up a local Jekyll environment. This requires installing Ruby and Jekyll. Once installed, you can navigate to your project folder in the terminal and run `bundle exec jekyll serve` to build the site and view it at `http://localhost:4000`.