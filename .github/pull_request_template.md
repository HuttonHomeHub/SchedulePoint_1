<!--
Thanks for contributing to SchedulePoint! Please complete this template.
Keep the PR focused — one logical change per PR. See CONTRIBUTING.md.
-->

## Summary

<!-- What does this PR do and why? Link the issue it closes. -->

Closes #

<!-- For a feature, link its approved spec + plan (see docs/PROCESS.md). -->

Spec / plan:

<!--
A tech-debt row covers stages 1-2 only while the change stays inside the behaviour it describes
and adds no new surface. Name the docs/specs/ path this change belongs to, or say which of the
triggers below it does not fire (ADR-0105):

  - a new user-facing entry point
  - a Playwright config or a CI step
  - a component's public contract, or a shared gate
  - the schema (also requires database-architect, without exception)

Crossing one of these mid-flight means the work stops and the spec is written.
-->

Spec path, or triggers not fired:

## Type of change

- [ ] ✨ Feature (`feat`)
- [ ] 🐛 Bug fix (`fix`)
- [ ] ♻️ Refactor (`refactor`)
- [ ] 📝 Documentation (`docs`)
- [ ] 🧪 Tests (`test`)
- [ ] 🔧 Build/CI/chore
- [ ] ⚠️ Breaking change

## How has this been tested?

<!-- Describe tests added/updated and manual verification steps. -->

## Feature Completion Criteria

<!-- Definition of Done — see docs/PROCESS.md. Tick all that apply. -->

- [ ] **Code** implemented to the approved design/architecture
- [ ] **Tests** completed (unit + integration/API + e2e/a11y as applicable; coverage not regressed)
- [ ] **Pre-push gate run locally** — lint/typecheck/test, plus `scripts/e2e-local.sh api` if `apps/api` changed and `scripts/e2e-local.sh web:<suite>` if a flag-on journey was added or changed ([docs/TESTING.md](../docs/TESTING.md))
- [ ] **Documentation** updated (`docs/`, `README`, `CLAUDE.md`, ADRs)
- [ ] **Security** reviewed (authN/Z, permission + resource scope, validation, secrets)
- [ ] **Performance** considered (queries/N+1, pagination, caching/async where justified)
- [ ] **Accessibility** considered (WCAG 2.2 AA for UI changes)
- [ ] **Docker build** succeeds (if runtime/deps changed)
- [ ] **CI** passes (format, lint, typecheck, tests)
- [ ] **Changelog** updated — changeset added (`pnpm changeset`) for user-visible change
- [ ] **Version impact** assessed (SemVer bump; breaking changes flagged)
- [ ] Commits follow [Conventional Commits](https://www.conventionalcommits.org/)

## Screenshots / notes

<!-- UI changes: include before/after screenshots. Other notes for reviewers. -->
