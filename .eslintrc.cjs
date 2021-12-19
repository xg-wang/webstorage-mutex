module.exports = {
  root: true,
  parserOptions: {
    sourceType: 'module',
  },
  parser: '@typescript-eslint/parser',
  plugins: ['@typescript-eslint', 'import', 'simple-import-sort', 'filenames'],
  extends: [
    'eslint:recommended',
    'plugin:import/errors',
    'plugin:import/warnings',
    'plugin:@typescript-eslint/eslint-recommended',
    'plugin:@typescript-eslint/recommended',
    'prettier',
  ],
  rules: {
    'sort-imports': 'off',
    'import/order': 'off',
    'import/no-unresolved': 'off',
    'import/no-extraneous-dependencies': 'error',
    'import/no-unassigned-import': 'error',
    'import/no-duplicates': 'error',
    '@typescript-eslint/no-use-before-define': ['error', { functions: false }],
    '@typescript-eslint/explicit-function-return-type': [
      'error',
      { allowExpressions: true },
    ],
    '@typescript-eslint/no-namespace': 'off',
    'simple-import-sort/imports': 'error',
    'simple-import-sort/exports': 'error',
  },
  overrides: [
    {
      parserOptions: {
        project: './tsconfig.json',
        // allows eslint from any dir
        tsconfigRootDir: __dirname,
        sourceType: 'module',
      },
      files: ['src/**/*.ts'],
      extends: [
        'plugin:@typescript-eslint/recommended-requiring-type-checking',
      ],
      rules: {
        'filenames/match-regex': ['error', '^[a-z0-9\\-]+$', true],
        'filenames/match-exported': ['error', 'kebab'],
      },
    },
  ],
};
