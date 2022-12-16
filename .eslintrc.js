module.exports = {
  env: {
    browser: true,
    node: true
  },
  ignorePatterns: ['es6/**/*', 'lib/**/*', '.eslintrc.js', 'jest.config.ts'],
  extends: [
    'eslint:recommended',
    'plugin:@typescript-eslint/recommended',
    'plugin:import/recommended',
    'plugin:import/typescript'
  ],
  parser: '@typescript-eslint/parser',
  parserOptions: {
    ecmaVersion: 2020,
    sourceType: 'module',
    project: './tsconfig.json'
  },
  plugins: ['@typescript-eslint', 'import', 'deprecation'],
  root: true,
  rules: {
    '@typescript-eslint/no-unused-vars': ['warn', { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }],
    '@typescript-eslint/no-inferrable-types': 'off',
    'deprecation/deprecation': 'warn'
  },
  overrides: [{ files: ['**/*.test.ts'], rules: { '@typescript-eslint/no-explicit-any': 'off' } }]
}
