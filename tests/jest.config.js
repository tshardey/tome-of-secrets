module.exports = {
  // Use jsdom to simulate a browser environment
  testEnvironment: 'jsdom',

  // A list of paths to modules that run some code to configure or set up the testing framework before each test
  setupFilesAfterEnv: ['<rootDir>/setup.js'],

  // A map from regular expressions to paths to transformers
  transform: {
    // Use babel-jest to transpile tests with the next babel version
    '^.+\\.js$': 'babel-jest',
  },

  // Map module names to a mock file. This is useful for assets like images.
  moduleNameMapper: {
    // Mock image imports to prevent errors during tests
    '\\.(jpg|jpeg|png|gif|eot|otf|webp|svg|ttf|woff|woff2|mp4|webm|wav|mp3|m4a|aac|oga)$':
      '<rootDir>/__mocks__/fileMock.js',
  },
};