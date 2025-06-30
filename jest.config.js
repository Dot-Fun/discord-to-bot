module.exports = {
  testEnvironment: 'node',
  setupFilesAfterEnv: ['<rootDir>/tests/setup.js'],
  coverageDirectory: 'coverage',
  collectCoverageFrom: [
    'session-manager.js',
    'discord-bot.js',
    '!node_modules/**',
    '!coverage/**',
    '!jest.config.js',
    '!tests/**'
  ],
  coverageThreshold: {
    global: {
      branches: 15,
      functions: 15,
      lines: 15,
      statements: 15
    }
  },
  testMatch: [
    '**/tests/**/*.test.js',
    '**/__tests__/**/*.test.js'
  ],
  verbose: true,
  testTimeout: 10000,
  moduleNameMapper: {
    '^@anthropic-ai/claude-code$': '<rootDir>/tests/__mocks__/@anthropic-ai/claude-code.js'
  }
};