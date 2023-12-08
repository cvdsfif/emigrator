module.exports = {
    preset: "ts-jest",
    testEnvironment: "node",

    roots: ['<rootDir>/tests', '<rootDir>/integration-tests', '<rootDir>/dev-tests'],
    testMatch: ['**/*.test.ts'],
    transform: {
        '^.+\\.tsx?$': 'ts-jest'
    },
    verbose: true,
    collectCoverage: true,
    collectCoverageFrom: ['!integration-test/*', '!tests/*', '!dev-test/*', '!**/index.ts', '!**/dist/**/*', '!tests/**/*']
};