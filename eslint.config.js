import tseslint from 'typescript-eslint';

/** @type {import("eslint").Linter.Config[]} */
export default [
  ...tseslint.configs.recommended,
  {
    files: ['**/*.ts?(x)'],
    ...tseslint.configs.disableTypeChecked,
  },
  {
    ignores: ['scripts/**'],
  },
];
