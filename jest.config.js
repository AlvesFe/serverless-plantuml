module.exports = {
  collectCoverageFrom: [
    '**/*.{js,ts}',
    '!**/jest-*',
    '!**/jest.*',
    '!**/bin/**',
    '!**/coverage/**',
    '!**/node_modules/**',
    '!**/.build/**',
    '!**/*.test.{js,ts}',
    '!**/*_MOCK_.{js,ts}',
    '!**/types/*.{js,ts}',
    '!**/MOCK/*.{js,ts}',
    '!sns.js'
  ],
  coveragePathIgnorePatterns: [
    '<rootDir>/dist/*',
    '<rootDir>/debug/*',
    '/node_modules/'
  ],
  moduleDirectories: ['node_modules'],
  testRegex: '.*\\.test.ts$',
  snapshotSerializers: [],
  collectCoverage: true,
  setupFiles: ['<rootDir>/setEnvVars.js'],
  transform: {
    '^.+\\.ts?$': 'ts-jest'
  },
  verbose: true,
  coverageThreshold: {
    global: {
      branches: 40,
      functions: 30,
      lines: 50,
      statements: 50
    }
  }
}