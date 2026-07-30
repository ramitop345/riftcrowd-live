import js from '@eslint/js';
import tseslint from 'typescript-eslint';

export default tseslint.config(
  {
    ignores: [
      'node_modules/**',
      'dist/**',
      'build/**',
      'game/**',
      'docs/**',
      'content/**',
      'tools/**',
    ],
  },
  {
    ...js.configs.recommended,
    files: ['**/*.js', '**/*.mjs', '**/*.cjs'],
  },
  {
    files: ['**/*.ts', '**/*.tsx'],
    extends: [js.configs.recommended, ...tseslint.configs.recommended],
  },
  {
    // Root tooling configuration files run in Node and are not part of a workspace build.
    files: ['eslint.config.js'],
    languageOptions: {
      sourceType: 'module',
    },
  },
);
