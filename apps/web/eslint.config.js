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
  {
    /**
     * A journey takes `test` from the shared fixture, never from Playwright: the fixture is what
     * fails a journey that met an API 429 (docs/TECH_DEBT.md #361, ADR-0175), so a spec importing the
     * stock one is silently unguarded. `e2e-support/` is exempt because the fixture itself is built
     * from the stock `test`. This rides `pnpm lint` and so costs no CI step.
     */
    files: ['e2e*/**/*.ts'],
    ignores: ['e2e-support/**'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          paths: [
            {
              name: '@playwright/test',
              importNames: ['test'],
              message:
                'Import `test` from the shared fixture (`../e2e-support/test`), which fails a journey that met a 429 (ADR-0175). A deliberate 429 opts out with `test.use({ allowRateLimited: true })` inside its one describe.',
            },
          ],
        },
      ],
    },
  },
];
