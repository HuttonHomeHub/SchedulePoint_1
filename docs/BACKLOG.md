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

- `S` **The activity editor's docked panel — the part ADR-0099 did not close.** This entry described
  the whole thing as unbuilt until the 2026-08-20 reconciliation pass, **on the day it shipped**. It
  read "The editor is a modal dialog today; the proposal is a panel docked into the workspace, so a
  planner can see the diagram while editing the activity they picked from it." That is ADR-0099 M6,
  released in `web-v0.95.0`: at `lg`+ the three ADR-0060 intents open the editor in the trailing
  context drawer, and the modal is now the chrome for narrow viewports only. Left standing, it was
  the top line of the file that decides what gets built next, pointing at work that exists — which
  is the same failure four Graphite milestones spent themselves discovering.

  **What the entry got right, and what it therefore still owes.** It said the unsaved-work question
  was "a real design question rather than an implementation detail", and the epic proved it three
  times: closing the drawer dropped focus to `<body>` (WCAG 2.4.3), Escape stopped closing the editor
  because the modal had been getting that from the platform, and a modal opened for one commit and
  took focus with it. All three are fixed. What is genuinely **left** is the case that entry named
  and the epic did not reach: **there is still no guard on navigating away** from a plan with unsaved
  scope edits — unchanged from the modal, and now easier to hit, because a drawer does not block the
  canvas behind it.

- `S` **The Gantt's remaining editing gaps.** The epic landed (ADR-0095, M1–M5,
  `web-v0.92.0` 2026-08-18) and this entry is rewritten to be about what is
  **left**, per this file's own convention — it previously described the whole
  epic as unstarted, three days after it shipped.
  **Delivered, and verified during the 2026-08-18 reconciliation pass rather
  than assumed:** dependency arrows (behind a default-off `View ▾` toggle — the
  substrate objection ADR-0059 §4 raised is answered by the geometry, since one
  bar per row makes a link an elbow through whitespace); in-cell editing with
  per-cell write scope; bar drag and `Alt+←/→`; the row menu; the columns
  chooser; Indent/Outdent; Insert activity; and URL-backed view memory.
  **The inherited requirement is discharged.** ADR-0093 removed the command
  surface's `Report progress`, and the product owner accepted that on
  2026-08-13 on the explicit basis that a Gantt selection would pick it up.
  It has: `progress` is in the shared `plan-actions/selection-actions.tsx`
  registry, which the Gantt calls with `canvas: null` — a context that gates
  only `zoom-to-selection` and `isolate-logic` — and
  `e2e-gantt-editing/object-actions.spec.ts` drives it against a real API.
  `add-note` is gone from that registry entirely, with a journey pinning its
  absence, and `clear-visual-placement` was narrowed out on 2026-08-14.
  **What is actually left**, all named by the ADR rather than discovered here:
  the **start-edge resize** (D4 — it carries a mode-dependent meaning, and
  shipping it without the mode statement the canvas has beside it would leave a
  planner unable to tell which of two writes their drag just made), the columns
  **chooser's** grid-width memory (T6 names it; the grid has no resize handle,
  so nothing can set it yet), and a **coarse-pointer** pass —
  `docs/TECH_DEBT.md` #133. `PROJECT_BRIEF.md` §8's "edit supported" is
  **substantially** met and deliberately not claimed closed.
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

> **Mail transport was on this list and is not a foundation gap any more.**
> `SmtpMailService` ships and is selected whenever `MAIL_SMTP_URL` is set;
> `LoggingMailService` is the fallback, not the implementation. The row said
> "`common/mail/` is a logging stub" until 2026-08-05, which is the reading that
> leads someone to build a second mail path — ADR-0058's failure, in the file
> that decides what gets built next. What remains is operational rather than
> structural: knowing that a send **failed** after Better Auth's handoff
> (`docs/TECH_DEBT.md` #94).

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
- `M` **Privacy operations** — **shaped by [ADR-0085](adr/0085-privacy-operations.md); do not start
  from this line.** That ADR reads the schema and finds the work is not "a hard-delete path": it is
  actor **anonymisation** (a hard delete would either cascade across 54 attribution columns or leave
  dangling ids), and it may not touch the audit log's append-only triggers. **Trigger to build:** the
  first organisation outside the product owner's own is onboarded, or a real subject request arrives.
  Named because an unconditioned `M` stays exactly one priority below whatever is being done.

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
