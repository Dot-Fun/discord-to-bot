module.exports = {
  testEnvironment: 'node',
  setupFilesAfterEnv: ['<rootDir>/tests/setup.js'],
  coverageDirectory: 'coverage',
  collectCoverageFrom: [
    'discord-bot.js',
    '!node_modules/**',
    '!coverage/**',
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
    '**/tests/**/*.test.js'
  ],
  verbose: true,
  testTimeout: 10000,
  moduleNameMapper: {
    '^@anthropic-ai/claude-code$': '<rootDir>/tests/__mocks__/@anthropic-ai/claude-code.js'
  }
};