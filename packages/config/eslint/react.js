// @ts-check
import react from 'eslint-plugin-react';
import reactHooks from 'eslint-plugin-react-hooks';
import jsxA11y from 'eslint-plugin-jsx-a11y';
import globals from 'globals';

import base from './base.js';

/**
 * ESLint flat config for React (Vite) applications.
 * Layers accessibility (jsx-a11y) and React Hooks rules on top of the base.
 *
 * @type {import('typescript-eslint').ConfigArray}
 */
export default [
  ...base,
  {
    files: ['**/*.{ts,tsx}'],
    ...react.configs.flat.recommended,
    languageOptions: {
      ...react.configs.flat.recommended.languageOptions,
      globals: { ...globals.browser },
    },
    settings: { react: { version: 'detect' } },
  },
  {
    files: ['**/*.{ts,tsx}'],
    plugins: { 'react-hooks': reactHooks, 'jsx-a11y': jsxA11y },
    rules: {
      ...reactHooks.configs.recommended.rules,
      ...jsxA11y.flatConfigs.recommended.rules,
      'react/react-in-jsx-scope': 'off',
      'react/prop-types': 'off',
    },
  },
  {
    // No raw colours in component markup (ADR-0055 §5). Every colour must come from a semantic
    // token, because a literal is invisible to the surface-scope mechanism AND to the computed
    // contrast suite: a hard-coded `#666` looks fine on the page and disappears on navy chrome,
    // and nothing in the build would ever tell you.
    //
    // Deliberately narrow. It matches COLOUR LITERALS inside `className`/`style` — not the
    // `style` attribute itself, which is the legitimate home of `{{ width }}` and
    // `{{ height: RULER_HEIGHT }}`. A rule everyone disables is worse than no rule.
    // `src/routes/**` and `src/app/**` were outside this glob until 2026-08-06, and that is where
    // the six PUBLIC screens live — so a hard-coded navy on the very brand panel ADR-0077 adds
    // would have linted clean, on the one surface a stranger sees first. Found by the ui-architect
    // pass over that epic, not by the rule.
    files: [
      '**/src/components/**/*.{ts,tsx}',
      '**/src/features/**/*.{ts,tsx}',
      '**/src/routes/**/*.{ts,tsx}',
      '**/src/app/**/*.{ts,tsx}',
    ],
    // The Canvas 2D painter is exempt: `fillStyle` takes a colour string, not a class, and
    // `render/palette.ts` resolves tokens at runtime with documented literal fallbacks for the
    // one case where `getComputedStyle` cannot answer (an offscreen export canvas).
    ignores: ['**/src/features/tsld/render/**', '**/src/features/tsld/export/**'],
    rules: {
      'no-restricted-syntax': [
        'error',
        {
          selector:
            'JSXAttribute[name.name=/^(className|style)$/] Literal[value=/#[0-9a-fA-F]{3,8}\\b|\\b(rgba?|hsla?|oklch|oklab|lab|lch)\\(/]',
          message:
            'Use a semantic token (bg-*, text-*, border-*) instead of a raw colour. A literal ' +
            'cannot follow a surface scope and is invisible to the token contrast suite — see ' +
            'ADR-0055 §5.',
        },
        {
          selector:
            'JSXAttribute[name.name=/^(className|style)$/] TemplateElement[value.raw=/#[0-9a-fA-F]{3,8}\\b|\\b(rgba?|hsla?|oklch|oklab|lab|lch)\\(/]',
          message:
            'Use a semantic token (bg-*, text-*, border-*) instead of a raw colour. A literal ' +
            'cannot follow a surface scope and is invisible to the token contrast suite — see ' +
            'ADR-0055 §5.',
        },
      ],
    },
  },
];
