/**
 * Jest config for the SDK semantic layer unit tests.
 *
 * The tests deliberately avoid jsdom: they exercise the deterministic
 * helpers in `src/utils/semantic-step-intelligence.ts` and
 * `src/utils/semantic-backend-client.ts` using lightweight DOM stubs,
 * which keeps the suite fast and dependency-free.
 *
 * Run via `npm test` once dev dependencies are installed.
 */
/** @type {import('jest').Config} */
module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  rootDir: '.',
  testMatch: ['<rootDir>/tests/**/*.spec.ts'],
  moduleFileExtensions: ['ts', 'tsx', 'js'],
  transform: {
    '^.+\\.tsx?$': [
      'ts-jest',
      {
        tsconfig: {
          target: 'ES2019',
          module: 'commonjs',
          jsx: 'react-jsx',
          esModuleInterop: true,
          moduleResolution: 'node',
          strict: false,
          skipLibCheck: true,
          types: ['jest', 'node'],
        },
        isolatedModules: true,
        diagnostics: false,
      },
    ],
  },
  testPathIgnorePatterns: ['/node_modules/', '/dist/'],
};
