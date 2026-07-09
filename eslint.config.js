// @ts-check
// Root ESLint flat config. Each workspace package ships its own
// eslint.config.js that extends the appropriate preset from @repo/config
// (base | react | nest). This root config lints repo-level scripts and
// configuration files only.
import base from '@repo/config/eslint/base';

export default [
  ...base,
  {
    ignores: ['apps/**', 'packages/**', '**/dist/**', '**/.next/**', '**/coverage/**'],
  },
];
