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
  const absolutePath = path.resolve(__dirname, '..', filePath);
  const html = fs.readFileSync(absolutePath, 'utf8');
  document.body.innerHTML = html;
};