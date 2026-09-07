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

- `S` **The activity editor's docked panel — WITHDRAWN, and the guard it named has SHIPPED.**

  **This entry has now been wrong three times, in three different directions, and it is the top line
  of the file that decides what gets built next.** It is rewritten rather than patched, because
  patching is what produced the second and third.

  1. It described the docked panel as unbuilt until the 2026-08-20 pass — **on the day it shipped**.
  2. The correction then said the editor opens in the trailing context drawer at `lg`+ and the modal
     is narrow-viewport chrome. **ADR-0101 reversed that on 2026-08-21**, one day later: an editor is
     a dialog, not a drawer. The 420 px drawer was a third of the `xl` width ADR-0061 gave this form
     _because 448 px had already proved unusable_, so it shipped four scrollbars. Verified
     2026-08-30 — `registerDrawerSubject` has **no production registrant at all**
     (`docs/TECH_DEBT.md` #156).
  3. It closed by naming the genuinely-owed part: "there is still no guard on navigating away from a
     plan with unsaved scope edits. Verified 2026-08-23 — `beforeunload`, `useBlocker` and any router
     blocker return **zero** matches." **ADR-0108 shipped exactly that on 2026-08-24**, the day after
     the verification. `components/layout/unsaved-work/navigation-guard.tsx` registers one
     `useBlocker` covering both the in-app and the unload channel, on a report of dirty **scopes**
     rather than a boolean, because ADR-0060 saves per write scope and an `isDirty` flag cannot name
     what is at risk.

  **So nothing here is owed.** The docked editor is a withdrawn decision, not deferred work; the
  guard exists. What survives is one channel recorded as open rather than claimed: a browser Back
  does not reach the blocker in this app, established by instrumenting rather than by reading
  (ADR-0108).

  4. **The mechanism is deleted, 2026-09-01.** #156 named two exits — build ADR-0097 D2, or close
     D2 as not wanted and delete all of it — and the product owner took the second. `drawer/` is
     gone (`drawer-subject.tsx`, `context-drawer.tsx`, `use-context-drawer-prefs.ts` and their
     suites), with the `drawer` chrome slot, the shell's trailing grid column and its Escape rung.
     **The row's own premise had gone stale too**: it said "the drawer itself is very much alive: it
     holds the Project Explorer", which ADR-0109 D2 had already moved into its own column — so the
     dead set was larger than the row described, which is this entry's shape for the fourth time.

  **Kept in full rather than deleted, because the shape is the point.** Every correction to this
  entry was made by someone who had just done the work, and each was overtaken within days by the
  next epic — which is `docs/RECONCILE.md`'s rule (_verify the claim; do not trust the document_)
  failing on the one document whose whole job is to be trusted about what is unbuilt.

  **SHIPPED 2026-08-23 (ADR-0108).** Four surfaces now register what they hold — the activity
  editor, `ActivityCreateDialog`, `CalendarFormDialog` and the calendar exceptions editor — and a
  reload, a tab close or a browser navigation confirms before discarding. It also closed a live
  defect this entry did not know about: the editor's own confirmation named three dirty scopes while
  the editor held **six**, so a changed weighted step closed in silence (`docs/TECH_DEBT.md` #63's
  second half).

  **Two corrections this entry earned along the way.** Its stated reason was stale — it read "now
  easier to hit, because a drawer does not block the canvas behind it", and **ADR-0101 had already
  reversed that**: the editor returned to `modalShell` and `registerDrawerSubject` has zero
  production callers (#156). And the accurate scope is narrower than it implied: a modal `<dialog>`
  sits in the browser's top layer and intercepts clicks behind it, so an in-app link was never
  reachable while the editor was open. What had no guard was reload, tab close and browser
  navigation. One channel is still open rather than claimed — a browser **Back** does not reach the
  blocker in this app (instrumented; see ADR-0108 D7).

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
- `M` **Revision Compare — comparing two IMPORTED revisions, which is the half that is left.**
  **All three tiers now ship, and this entry went stale within hours of the last two — for the
  second time in two days.** The version before this one said the change list and the change
  picture were unbuilt and named their blocker as `grep -c 'model BaselineDependency'` returning
  **0**, "re-verified 2026-09-06". It returns **1**: that grep is what ADR-0126 M5 shipped, the
  same day, and the entry was re-verified hours before the thing it verified stopped being true.
  That is this file's own recurring failure — the entry above records four instances of it — so
  the shipped halves are removed per the convention at the top and only what is genuinely owed is
  kept.
  **Shipped:** tier 3's `how much` (ADR-0125), the change list (ADR-0126) and the change picture
  (ADR-0127, `View ▾ ▸ Compare on diagram`, **off by default**), released `api-v0.59.0` /
  `web-v0.122.0`.
  **REFUSED, not deferred — do not re-open it as a scoping decision.** Tier 3's `which change` half
  attributes the slip to individual edits, and the ADR-0100-pattern gate this entry itself demanded
  was applied and **failed**: replayed in six orders on the seed catalogue's fixture the same change
  scored 30, 18, 2 or 0 working days by position alone (12.9 pp spread against a 10 pp bar, unstable
  top three), while the sum was order-free and stable at 139 d in every permutation. Re-open it only
  with a design that supplies the ordering the measurement showed is missing.
  **What is left is the interchange comparison — Rev B against Rev C, both exported from P6.** That
  is the version somebody pays for, and it is the one thing the three shipped tiers cannot do.
  **Its blocker is NOT the one the previous text named, and is worth stating precisely because the
  stale version would send somebody to the schema:** `GET …/schedule/revision-compare` is
  **plan-nested**, and `RevisionCompareQueryDto` types both `from` and `to` as a baseline **of that
  plan** (`to` additionally accepting the literal `live`). Two files imported separately land as
  **two plans** (ADR-0050: "import target is always a new plan"), and nothing in the model lets a
  comparison span them. So this needs a cross-plan comparison — which is a real design question
  about identity, since matching an activity across two independent imports cannot use the id and
  has to use the source `activity_code`, with its own reject/repair/report contract (ADR-0035) for
  a code that is absent, duplicated or reused. Verified 2026-09-06 by reading the controller and
  the DTO, not the schema.
  **And one measurement is owed before any of it:** the compare overlay ships default-OFF because
  its paint cost is **unanswered**, not because it was judged acceptable. The M0 harness works and
  refused to produce a verdict — the container's own baseline moved 0.56→1.85 pp at 1646 and
  0.93→10.00 pp at 1920 between two runs an hour apart with no code change, against a 2.00 pp bar.
  It needs a **headed run on the product owner's hardware**; the environment here is recorded as
  disqualified.

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
