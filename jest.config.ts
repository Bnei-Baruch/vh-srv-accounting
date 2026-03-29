import type { Config } from 'jest';

const config: Config = {
  testEnvironment: 'node',
  testMatch: ['**/src/__tests__/**/*.test.ts'],
  transform: {
    '^.+\\.ts$': ['ts-jest', { tsconfig: 'tsconfig.test.json' }],
  },
  coverageDirectory: 'coverage',
  collectCoverageFrom: ['src/**/*.ts', '!src/__tests__/**', '!src/types/**'],
  moduleNameMapper: {
    '^@/(.*)$': '<rootDir>/src/$1',
  },
};

export default config;
