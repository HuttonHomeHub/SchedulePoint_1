# Backlog

Candidate work that is **not yet scheduled**. This is a grooming space; once an
item is ready and prioritised, promote it to a GitHub issue (with acceptance
criteria) and, if it shapes the product, reflect it in [ROADMAP.md](ROADMAP.md).

> Convention: keep items outcome-focused. Prefix with a rough size —
> `S`/`M`/`L` — when known. **Remove items once they become issues, and remove
> them once they are done** — a backlog that still lists finished work is worse
> than no backlog. Reconciled alongside [TECH_DEBT.md](TECH_DEBT.md).

This file holds **candidate** work. It is not the product plan
([ROADMAP.md](ROADMAP.md)), the debt register ([TECH_DEBT.md](TECH_DEBT.md)),
or the engine's capability gap map (ADR-0034 §8 — the authoritative list of
scheduling behaviours still to build).

## Product (unscheduled)

Product direction lives in [ROADMAP.md](ROADMAP.md) and
[PROJECT_BRIEF.md](PROJECT_BRIEF.md); the engine's remaining behaviours live in
the ADR-0034 capability matrix. Listed here only when a candidate is neither —
a product idea that has not yet earned a roadmap line:

- `L` **Gantt view.** The brief's one substantial unbuilt surface: a
  conventional grid/bar view alongside the TSLD, for stakeholders who read
  schedules that way and for printed issue.
- `M` **Internationalisation / localisation.** The code avoids hard-coded
  currency and date formats (`Intl` throughout, per-plan `currencyCode`), so
  this is a real option rather than a rewrite — but no locale machinery exists.
- `M` **Notifications.** Plan changes, pen hand-off requests, and import
  completion currently surface only in-app. Needs the mail transport (below)
  first.

## Platform foundations not yet built

Each of these has an **accepted ADR** and no implementation — see
[ARCHITECTURE.md](ARCHITECTURE.md) §10. They are listed here because the
decision is made; only the work is outstanding.

- `M` **Mail transport** (`common/mail/` is a logging stub). Invitation emails
  are logged, not sent — the first user-visible thing that needs this.
- `M` **Background processing** — BullMQ + Redis (ADR-0009). The candidate first
  consumer is schedule interchange import, which is synchronous today.
- `M` **Caching** — Redis, cache-aside (ADR-0010). Measure first: no read path
  has been demonstrated to need it.
- `M` **Object storage** — S3-compatible abstraction (ADR-0011). No feature
  requires file upload yet.
- `M` **Metrics & tracing** — OpenTelemetry (ADR-0013). Includes choosing the
  backend, which is the actual decision.
- `M` **Append-only audit log** (TECH_DEBT #14). Row attribution and structured
  logs are not an audit trail.
- `M` **Privacy operations** — a hard-delete path and a data-export path, both
  explicit and audited. Everything is a soft delete today.

## Engineering / delivery

- `M` **Decide and document the hosting platform** (see
  [TECH_DEBT.md](TECH_DEBT.md)). The container/registry foundation is
  deliberately platform-neutral; the decision is still owed.
- `S` **PR-title lint in CI** — commitlint runs as a git hook, so a squash-merge
  title is only enforced by convention. Belt-and-braces.
- `S` **Branch-protection & release-bot permissions** documented as code rather
  than configured by hand in the GitHub UI.
- `S` **Bundle-size budget checks in CI** for the web app.
- `M` **Performance budget / Lighthouse CI** on the plan workspace — the one
  screen where regressions would actually hurt.
- `S` **Dependency licence checking in CI.**
- `M` **Centralise the soft-delete filter** via a Prisma client extension, so it
  is enforced globally rather than repeated per repository. The cost of the
  current approach is that one forgotten `deletedAt: null` leaks deleted rows;
  the cost of the extension is a less obvious query path. Worth designing before
  building.
