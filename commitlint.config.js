/**
 * Commitlint configuration — enforces Conventional Commits.
 * See docs/CONTRIBUTING guidance and CLAUDE.md "Commit standards".
 *
 * Format: <type>(<optional scope>): <subject>
 * Example: feat(api): add a recurring job scheduler
 */
export default {
  extends: ['@commitlint/config-conventional'],
  rules: {
    'type-enum': [
      2,
      'always',
      [
        'feat', // A new feature
        'fix', // A bug fix
        'docs', // Documentation only changes
        'style', // Formatting; no code-behaviour change
        'refactor', // Neither fixes a bug nor adds a feature
        'perf', // Performance improvement
        'test', // Adding or correcting tests
        'build', // Build system or dependencies
        'ci', // CI configuration
        'chore', // Other changes that don't modify src/test
        'revert', // Reverts a previous commit
      ],
    ],
    'scope-enum': [
      2,
      'always',
      [
        'web',
        'api',
        'config',
        'types',
        'interchange',
        'db',
        'ci',
        'docs',
        'deps',
        // **`deps-dev` is Dependabot's own output, not a style choice.**
        // `.github/dependabot.yml` sets `prefix-development: 'chore(deps-dev)'`, so every
        // development-dependency PR it opens is titled that way — up to ten at once. Without this
        // entry a PR-title check goes red on day one across every open bot PR, which is verbatim
        // ADR-0058's "a gate set at a bar it fails on day one gets deleted rather than fixed".
        //
        // The distinction is KEPT rather than collapsed to `deps` (product-owner decision, CQ-1):
        // `main`'s history already records which bumps were development-only, and flattening it
        // would throw that away to save one line.
        'deps-dev',
        'release',
        'repo',
      ],
    ],
    'scope-case': [2, 'always', 'kebab-case'],
    'subject-case': [2, 'never', ['upper-case', 'pascal-case', 'start-case']],
    'subject-full-stop': [2, 'never', '.'],
    'header-max-length': [2, 'always', 100],
    'body-max-line-length': [2, 'always', 100],
  },
};
