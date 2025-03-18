// jest.config.js
module.exports = {
  roots: ["<rootDir>/tests"],
  transform: {
    '^.+\\.(js|jsx|mjs|cjs)$': 'babel-jest',
  },
  collectCoverageFrom: [
    '**/src/**/*.[jt]s',
    '!**/src/**/*.spec.[jt]s',
    '!**/src/**/*.mock.[jt]s',
    '!**/src/**/*.e2e.[jt]s',
    '!**/tests/**/*.test.[jt]s',
],
coverageDirectory: "./workdocs/coverage",
coverageReporters: ["text", "lcov", "json-summary"],
reporters: [
  "default",
  ["jest-junit", {outputDirectory: './workdocs/coverage', outputName: "junit-report.xml"}]
]


};
