import fs from 'fs';
import path from 'path';

/**
 * Mocks the scrollIntoView function for the JSDOM environment.
 * This function is not implemented in JSDOM and will cause tests to fail if not mocked.
 */
Element.prototype.scrollIntoView = () => {};
window.alert = () => {}; // Mock the alert function
window.confirm = () => true; // Mock the confirm function to always return true

/**
 * A global helper function to load HTML content from a file into the JSDOM body.
 * This simplifies setting up the DOM for each test.
 * @param {string} filePath - The path to the HTML/Markdown file relative to the project root.
 */
global.loadHTML = (filePath) => {
  const projectRoot = path.resolve(__dirname, '..');
  const absolutePath = path.resolve(projectRoot, filePath);
  let html = fs.readFileSync(absolutePath, 'utf8');
  // Resolve Jekyll {% include %} tags by inlining the included file content
  html = html.replace(/\{%[-\s]*include\s+([\w/.-]+)\s*[-\s]*%\}/g, (match, includePath) => {
    const includeAbsPath = path.resolve(projectRoot, '_includes', includePath);
    if (fs.existsSync(includeAbsPath)) {
      return fs.readFileSync(includeAbsPath, 'utf8');
    }
    return match;
  });
  document.body.innerHTML = html;
};