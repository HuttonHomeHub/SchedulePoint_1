# Contributing to SchedulePoint

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

**`main` is deliberately NOT protected** — product-owner decision, 2026-09-11, taken with
the measurement and the steps in front of them (CLAUDE.md §8). Nothing is configured, and
**no CI check can block a merge here.** What stands in for enforcement is CLAUDE.md
§19.9: read the check runs for the pull request's current head, and confirm every one is
`completed` with `conclusion: success`, before merging.

If that decision is ever revisited, this is the shape it should take — but
**copy the job names out of `.github/workflows/` on the day, never from this list.**
A required check whose name never reports sits **pending forever**, so every pull request
becomes permanently unmergeable with no error naming the cause. That is not hypothetical:
this list named `Verify feature template` until 2026-09-11, a job **ADR-0057 deleted**
along with the reference template it verified. Correct when written, a trap by the time
anyone followed it, and nothing connected the deletion to the instruction.

- **Require a pull request before merging** (no direct pushes to `main`).
- **Require status checks to pass.** The jobs that existed on 2026-09-11 were:
  - `Format, lint, typecheck & unit tests`
  - `End-to-end tests`
  - `Build & smoke-boot images`
  - `Check the PR title is a Conventional Commit`
  - `Analyze (javascript-typescript)` (CodeQL)
- **Require branches to be up to date before merging** (so checks run against
  the post-merge tree).
- **Require conversation resolution.** An approving review needs a **second person**; with
  a single committer it makes `main` unmergeable rather than safe, so leave approvals at
  zero until there is somebody to approve.
- Keep **Do not allow bypassing the above** on, including for admins.

Without protection, a job that is red can still be merged — which is exactly how a broken
build reaches `main`, and why §19.9 is a rule rather than a courtesy.

## Reporting bugs & requesting features

Use the [issue templates](.github/ISSUE_TEMPLATE/). For security issues, do
**not** open a public issue — follow [`SECURITY.md`](SECURITY.md).

## Questions

Open a [discussion](https://github.com/HuttonHomeHub/SchedulePoint_1/discussions). Thanks
again for helping make SchedulePoint better!
