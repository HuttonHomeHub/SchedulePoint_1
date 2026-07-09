# Contributing to Blank App

Thank you for contributing! This guide explains how we work. It complements the
project operating manual, [`CLAUDE.md`](CLAUDE.md), which is the source of truth
for standards.

## Code of Conduct

By participating you agree to uphold our [Code of Conduct](CODE_OF_CONDUCT.md).

## Getting set up

See [`docs/DEVELOPMENT.md`](docs/DEVELOPMENT.md). The short version:

```bash
corepack enable          # provides pnpm
./scripts/setup.sh       # deps, .env, local Postgres
pnpm dev
```

## Workflow

1. **Find or open an issue** describing the change. Search first to avoid
   duplicates.
2. **Branch** from up-to-date `main`: `feat/<slug>`, `fix/<slug>`,
   `docs/<slug>`, or `chore/<slug>`.
3. **Make small, focused commits** using
   [Conventional Commits](https://www.conventionalcommits.org/). `pnpm commit`
   launches an interactive prompt if you'd like help.
4. **Add tests** for new behaviour and a **regression test** for every bug fix.
5. **Update documentation** touched by your change (docs/, README, CLAUDE.md).
6. **Add a changeset** for user-visible changes: `pnpm changeset`.
7. **Open a pull request** into `main` and fill in the template.

## Before you push

Your change must pass locally what CI enforces:

```bash
pnpm format:check
pnpm lint
pnpm typecheck
pnpm test
```

Git hooks (Husky) run `lint-staged` and commitlint automatically, but running
the full suite yourself avoids CI round-trips.

## Commit message format

```text
<type>(<scope>): <subject>

[optional body — the "why", wrapped at 100 cols]

[optional footer(s) — e.g. "Closes #123" or "BREAKING CHANGE: ..."]
```

- **Types:** `feat, fix, docs, style, refactor, perf, test, build, ci, chore, revert`
- **Scopes:** `web, api, config, types, db, ci, docs, deps, release, repo`
- Imperative, lower-case, no trailing period, subject ≤ 100 chars.

Examples:

```text
feat(api): add a recurring job scheduler
fix(web): prevent double-submit on the sign-up form
docs(repo): document the release process
```

## Pull request expectations

- One logical change per PR; keep diffs reviewable.
- CI green, at least one approving review, and CODEOWNERS satisfied.
- Rebase on `main` rather than merging it in; we **squash-merge** with a
  Conventional Commit title.
- UI changes include before/after screenshots and note accessibility impact.

## Branch protection (required checks)

"CI green before merge" (CLAUDE.md §7) is only reliable when GitHub **enforces**
it. Configure `main` under **Settings → Branches → Branch protection rules** (or
a ruleset) so it cannot regress by convention alone:

- **Require a pull request before merging** (no direct pushes to `main`).
- **Require status checks to pass**, and mark these CI jobs as required:
  - `Format, lint, typecheck & unit tests`
  - `Verify feature template`
  - `End-to-end tests`
  - `Build & smoke-boot images`
  - `Analyze (javascript-typescript)` (CodeQL)
- **Require branches to be up to date before merging** (so checks run against
  the post-merge tree).
- **Require conversation resolution** and at least one approving review
  (CODEOWNERS-satisfied).
- Keep **Do not allow bypassing the above** on, including for admins.

Without this, a job that is red (e.g. only one of several CI jobs failing) can
still be merged — which is exactly how a broken build can reach `main`.

## Reporting bugs & requesting features

Use the [issue templates](.github/ISSUE_TEMPLATE/). For security issues, do
**not** open a public issue — follow [`SECURITY.md`](SECURITY.md).

## Questions

Open a [discussion](https://github.com/HuttonHomeHub/blank-app/discussions). Thanks
again for helping make Blank App better!
