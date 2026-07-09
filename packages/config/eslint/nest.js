// @ts-check
import base from './base.js';

/**
 * ESLint flat config for the NestJS API.
 * NestJS relies heavily on decorators and constructor injection, so a few
 * base rules are relaxed to avoid false positives.
 *
 * @type {import('typescript-eslint').ConfigArray}
 */
export default [
  ...base,
  {
    files: ['**/*.ts'],
    rules: {
      // Decorator metadata legitimately triggers these; disable for the API.
      '@typescript-eslint/no-extraneous-class': 'off',
      '@typescript-eslint/interface-name-prefix': 'off',
      // NestJS lifecycle methods and providers are often intentionally empty.
      '@typescript-eslint/no-empty-function': 'off',
      // Constructor-injected classes must be VALUE imports so DI metadata
      // (emitDecoratorMetadata) resolves at runtime — converting them to
      // type-only imports would break dependency injection.
      '@typescript-eslint/consistent-type-imports': 'off',
    },
  },
];
