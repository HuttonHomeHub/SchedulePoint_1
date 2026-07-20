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
