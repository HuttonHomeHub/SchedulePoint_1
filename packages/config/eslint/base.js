// @ts-check
import eslint from '@eslint/js';
import tseslint from 'typescript-eslint';
import importPlugin from 'eslint-plugin-import';
import prettier from 'eslint-config-prettier';
import globals from 'globals';

/**
 * Base ESLint flat config shared by every workspace package.
 * Extend this in app-specific configs (see ./react.js, ./nest.js).
 *
 * Type-aware rules run against each package's tsconfig via the project
 * service. Root-level config files (`*.config.*`, `eslint.config.*`) are not
 * part of a tsconfig, so they resolve to the inferred default project.
 *
 * @type {import('typescript-eslint').ConfigArray}
 */
export default tseslint.config(
  {
    ignores: ['dist/**', 'build/**', '.next/**', 'coverage/**', '.turbo/**', 'node_modules/**'],
  },
  eslint.configs.recommended,
  // Type-checked rules for TypeScript sources only.
  {
    files: ['**/*.{ts,tsx}'],
    extends: [...tseslint.configs.recommendedTypeChecked],
    languageOptions: {
      parserOptions: {
        projectService: {
          allowDefaultProject: ['*.config.*', 'eslint.config.*'],
        },
        tsconfigRootDir: process.cwd(),
      },
      globals: { ...globals.node },
    },
    plugins: { import: importPlugin },
    rules: {
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_' },
      ],
      '@typescript-eslint/consistent-type-imports': [
        'error',
        { prefer: 'type-imports', fixStyle: 'inline-type-imports' },
      ],
      '@typescript-eslint/no-floating-promises': 'error',
      '@typescript-eslint/no-misused-promises': 'error',
      'import/order': [
        'error',
        {
          groups: ['builtin', 'external', 'internal', 'parent', 'sibling', 'index'],
          'newlines-between': 'always',
          alphabetize: { order: 'asc', caseInsensitive: true },
        },
      ],
      'no-console': ['warn', { allow: ['warn', 'error'] }],
      eqeqeq: ['error', 'always', { null: 'ignore' }],
    },
  },
  // Plain JS/MJS/CJS files and TS config files: no type-aware linting.
  // (They are not part of a package tsconfig, so type information is absent.)
  {
    files: ['**/*.{js,mjs,cjs}', '**/*.config.{ts,mts,cts}'],
    extends: [tseslint.configs.disableTypeChecked],
    languageOptions: {
      globals: { ...globals.node },
    },
  },
  // Relax a few rules in tests: mocks legitimately produce `any` flows and
  // pass unbound methods, and non-null assertions are common in fixtures.
  {
    files: ['**/*.{test,spec}.{ts,tsx}', '**/*.e2e-spec.ts'],
    rules: {
      '@typescript-eslint/no-non-null-assertion': 'off',
      '@typescript-eslint/no-explicit-any': 'off',
      '@typescript-eslint/no-unsafe-assignment': 'off',
      '@typescript-eslint/no-unsafe-argument': 'off',
      '@typescript-eslint/no-unsafe-member-access': 'off',
      '@typescript-eslint/no-unsafe-call': 'off',
      '@typescript-eslint/no-unsafe-return': 'off',
      '@typescript-eslint/unbound-method': 'off',
    },
  },
  prettier,
);
