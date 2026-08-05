import react from '@repo/config/eslint/react';

export default [
  ...react,
  {
    /**
     * `public/` is copied verbatim into the image and served as-is — classic browser scripts, not
     * modules, and never processed by Vite or TypeScript. The shared React preset assumes a bundled
     * ES-module world, so without this block `window`/`document`/`localStorage` read as undefined
     * globals.
     *
     * There is exactly one file here today (`theme-boot.js`, ADR-0074) and it is deliberately tiny:
     * anything larger belongs in `src/`, where the type checker can see it.
     */
    files: ['public/**/*.js'],
    languageOptions: {
      sourceType: 'script',
      // Spelled out rather than pulled from `globals`, which is a transitive dependency of the
      // shared preset and not a direct one of this package. Four names is cheaper than a dependency
      // whose only consumer is this block.
      globals: {
        window: 'readonly',
        document: 'readonly',
        localStorage: 'readonly',
        matchMedia: 'readonly',
      },
    },
    rules: {
      // `catch (_)` with an empty body is the point: a throwing `localStorage` (private browsing,
      // some embedded webviews) must fall back to the light theme rather than take down the page
      // before React mounts.
      'no-unused-vars': ['error', { caughtErrors: 'none' }],
    },
  },
];
