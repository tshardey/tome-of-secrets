const fs = require('fs');
const path = require('path');

// JSDOM doesn't implement browser-specific APIs like alert, confirm, or print.
// We provide simple mock implementations for them to prevent tests from crashing.

// Mock `alert` to do nothing.
global.alert = () => {};
// Mock `confirm` to always return true, simulating a user clicking "OK".
global.confirm = () => true;
// Mock `window.print`.
global.window.print = () => {};
HTMLFormElement.prototype.submit = () => {};

/**
 * Loads the HTML content from a file and sets it as the document body for testing.
 * This function makes the testing framework modular. To test a different page,
 * you can simply call this function with a different file path.
 * @param {string} filePath - The relative path to the HTML file from the project root.
 */
global.loadHTML = (filePath) => {
  const absolutePath = path.resolve(__dirname, '..', filePath);
  const html = fs.readFileSync(absolutePath, 'utf8');
  document.body.innerHTML = html;
};