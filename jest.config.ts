module.exports = {
    preset: "ts-jest",
    testEnvironment: "node",
    roots: ['<rootDir>/tests', '<rootDir>/integration-tests'],
    testMatch: ['**/*.test.ts'],
    transform: {
        '^.+\\.tsx?$': 'ts-jest'
    },
    verbose: true,
    collectCoverage: true
};