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

- `M` **Gantt dependency arrows and Gantt editing.** The view itself shipped
  (ADR-0059, default-on 2026-07-28) deliberately read-only and arrow-free:
  arbitrary link routing is the one thing that forced canvas on the TSLD, so
  drawing arrows would drag the rejected substrate back in through the side
  door, and the brief says read-primary. Both are worth revisiting **on
  evidence of use**, not before — that gate is the point.
- `M` **Internationalisation / localisation.** The code avoids hard-coded
  currency and date formats (`Intl` throughout, per-plan `currencyCode`), so
  this is a real option rather than a rewrite — but no locale machinery exists.
- `M` **Notifications.** Plan changes, pen hand-off requests, and import
  completion currently surface only in-app. Needs the mail transport (below)
  first.
- `L` **Per-activity plan revision history.** "Who changed this duration?" is
  unanswerable and will stay that way, because the audit log deliberately and
  **permanently** excludes ordinary content edits (ADR-0073 §3): an activity's
  own name, dates, duration, lane or progress changes nothing outside that
  activity, and it is the one class that scales with **interactions** rather
  than with the size of the programme — a planner dragging bars for an afternoon
  generates arbitrarily many, which is the cheapest way to make an audit log
  unreadable. Named here so the gap is not re-litigated as audit coverage: it is
  a **different feature**, with a different table, a different retention story
  and a different read model (a per-activity timeline, not an organisation
  feed). Worth building on evidence that planners ask for it, not before.

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

## WBS follow-ons (ADR-0063)

- `S` **Dissolve for a resource `GROUP`** — the resource tree (ADR-0053 §3) has the same shape as
  the WBS tree and the same problem: deleting a group takes its subtree with it, and there is no
  way to remove the grouping alone. Deliberately out of scope for ADR-0063 (spec C-6), which was
  about the WBS; the asymmetry is a stated decision, not an oversight, and this is where it gets
  closed. The service-side shape is already proven — re-parent the children under the lock, then
  soft-delete the now-childless node.
- `S` **Nest a summary from the Members panel** — spec C-1b deliberately kept WBS nesting in the
  Breakdown picker, because a checklist that can restructure the tree needs cycle feedback a
  checklist cannot express well. Worth revisiting with a design for that feedback rather than by
  simply widening the list.
- `S` **A shape cue for the derived Unassigned band bar** (TECH_DEBT #71) and a widened
  `CheckboxField` for the bulk-selection column (TECH_DEBT #72).

## Engineering / delivery

- `M` **Re-decide the hosting platform, now that its own trigger has fired.**
  This entry used to say the decision "is still owed", which
  [TECH_DEBT.md](TECH_DEBT.md) #5 had already contradicted: the Docker Compose
  stack with the ADR-0047 Watchtower profile **is** the deployment model, and has
  been since 2026-08-01. Two documents disagreeing about whether a decision
  exists is worse than either answer.
  What reopens it is the condition #5 itself names — **a second operator running
  their own instance**, or a tenant needing an availability guarantee one host
  cannot make. Both are now in prospect (external clients, 2026-08-03), so this
  is a live item again rather than a standing regret. The foundation stays
  platform-neutral (ADR-0018 self-migrating image, ADR-0027 per-package tags,
  GHCR), so this is a decision and an ADR, not a rewrite.
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
