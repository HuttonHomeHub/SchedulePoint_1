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
  so nothing can set it yet), and a **coarse-pointer** pass _(the citation here
  read `docs/TECH_DEBT.md` #133 and is corrected 2026-09-11: that row **closed
  on 2026-08-28**, and its subject was the merged command **strip**, not this
  view — its ledger entry reads "Overtaken — ADR-0109 D1 deleted the width
  ladder and the `⋯`, so nothing can leave the row". So the citation was stale
  **and** about a different surface. Whether a Gantt-specific coarse pass is
  owed is deliberately **not asserted here**: ADR-0118 D6 narrowed the
  house rule to `pointer: coarse` and took the candidate set from 46 to one, and
  nobody has re-measured this view since. It has no live row, which is the
  honest state)_. `PROJECT_BRIEF.md` §8's "edit supported" is
  **substantially** met and deliberately not claimed closed.
- ~~`M` **Revision Compare — comparing two IMPORTED revisions.**~~ **SHIPPED, and this entry was
  stale for the FIFTH time — 2026-09-10.** Every tier now exists, including the one this row spent
  most of its length arguing was the half that was left.

  **What the entry said was owed, and what is true.** It read _"What is left is the interchange
  comparison — Rev B against Rev C, both exported from P6. That is the version somebody pays for,
  and it is the one thing the three shipped tiers cannot do"_, and then correctly named its blocker
  as identity: the route is plan-nested, two imports land as two plans (ADR-0050), and matching
  across them cannot use the id. **ADR-0129 built exactly that**, filed at
  `docs/adr/0129-identity-across-two-imports-is-the-code.md`. Verified 2026-09-10 by finding the
  parts rather than by reading the ADR: `CrossPlanRevisionCompareController`
  (`organizations/:orgSlug/cross-plan-revision-compare`, org-scoped because two plan ids leave no
  honest `:planId`), the web panel, its print document, and `apps/web/e2e-revision-compare`.

  **The entry even researched the design that shipped.** Its last paragraphs settle that the key is
  `Activity.code`, that the column is nullable, and that `uq_activities_plan_code` makes duplication
  a case the database refuses rather than one to repair — which is ADR-0129's correlation rule
  almost verbatim. So this is not an entry that failed to anticipate the work; it is an entry that
  specified the work, watched it ship, and went on describing it as owed.

  **Why it is rewritten rather than deleted.** Two facts inside it are still load-bearing and live
  nowhere else. **A re-code is indistinguishable from a removal plus an addition, permanently and by
  construction** — the row reasoned its way to that before ADR-0129 stated it as a product promise.
  And its method note stands as the sharpest one in this file: a constraint claim is verified against
  `prisma/migrations/`, **never** against `schema.prisma`, because Prisma cannot express a partial
  unique and a grep for `@@unique` structurally cannot see the answer.

  **The pattern is the reason this stays visible.** The entry above records four instances of this
  file describing shipped work as owed; this is the fifth, and the first where the entry had already
  been corrected twice _for the same defect_. `docs/BACKLOG.md` decides what gets picked up next, so
  a stale entry does not merely mislead — it spends somebody's day. Nothing observes it: no gate
  reads this file, and `check:debt-status` covers `docs/TECH_DEBT.md` alone.

- `M` **Internationalisation / localisation.** The code avoids hard-coded
  currency and date formats (`Intl` throughout, per-plan `currencyCode`), so
  this is a real option rather than a rewrite — but no locale machinery exists.
- `M` **Notifications.** Plan changes, pen hand-off requests, and import
  completion currently surface only in-app. _(Corrected 2026-09-11: **its stated
  blocker has lapsed, and the pointer no longer resolves.** "Needs the mail
  transport (below) first" pointed at an entry in Platform foundations that was
  removed on 2026-08-05 — that section now carries a call-out explaining why —
  and the transport is real: `common/mail/smtp-mail.service.ts` ships beside
  `logging-mail.service.ts`, selected purely on `MAIL_SMTP_URL` being set, and
  the product owner confirmed the deployed host sending on 2026-08-05. So this
  entry was blocked on something that shipped over a month ago, in the file that
  decides what gets built next — the **fourth** time this file has said that, and
  the first where the stale claim was a **dependency** rather than the item
  itself.)_
  What it genuinely needs is a decision about **which** events earn a
  notification and through what channel, which is the ADR-0075 shape one feature
  along: mail is best-effort and its failure belongs to the operator, so a
  notification a planner is told was sent is a claim this transport cannot
  make.
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
  _(Re-read 2026-09-11 and it stands, with one thing now true that was not when
  it was written: the revision-comparison programme — ADR-0125/0126/0127/0129 —
  answers the **what** half between two named revisions, including logic,
  constraints, calendar, WBS parent, lane and progress. It answers **who** for
  nothing, because a baseline snapshot has no actor, so the entry's own headline
  question is unaffected. Worth knowing before somebody scopes this as "add an
  actor column": the two halves live in different models.)_

## Platform foundations not yet built

Each of these has an **accepted ADR** and no implementation — see
[ARCHITECTURE.md](ARCHITECTURE.md) §10. They are listed here because the
decision is made; only the work is outstanding — **except where a later ADR has
narrowed one, which the Background-processing entry now states.**

> **All four were re-verified against the code on 2026-09-11**, because this
> section has twice listed a shipped capability as unbuilt (see both call-outs
> below) and a third would not be an accident. None of `bullmq`, `ioredis`,
> `redis`, `@aws-sdk/*` or `@opentelemetry/*` appears in any workspace's
> `package.json`, and none of `Queue(`, `createClient`, `S3Client`,
> `PutObjectCommand`, `@opentelemetry` or `trace.getTracer` appears in
> `apps/api/src`, `apps/web/src` or `packages/*/src`. The two occurrences of the
> string "BullMQ" are both comments naming it as a future option. So the four
> gaps are real; what was inaccurate was the framing of one of them.

> **Mail transport was on this list and is not a foundation gap any more.**
> `SmtpMailService` ships and is selected whenever `MAIL_SMTP_URL` is set;
> `LoggingMailService` is the fallback, not the implementation. The row said
> "`common/mail/` is a logging stub" until 2026-08-05, which is the reading that
> leads someone to build a second mail path — ADR-0058's failure, in the file
> that decides what gets built next. What remains is operational rather than
> structural: knowing that a send **failed** after Better Auth's handoff —
> **`docs/TECH_DEBT.md` #100**, not #94 _(repointed 2026-09-11: #94 closed on
> 2026-08-08 and its own ledger entry says "Live gap is **#100**", so this
> sentence named a closed row as the thing that remains; #100 is
> operator-owned and deferred on a named closing condition)_.

> **The append-only audit log was on this list too, and shipped over a year ago.**
> `audit_events` has existed since `20260803170000_audit_events`; ADR-0072 made it
> append-only **in the database** (`BEFORE UPDATE OR DELETE` / `BEFORE TRUNCATE`
> triggers, `ENABLE ALWAYS`) and ADR-0073 widened its coverage to seven families
> under a route census. The row survived here justified by "row attribution and
> structured logs are not an audit trail" — which is the **argument that was
> accepted and acted on**, still being offered as a reason to start. `#14`'s own
> ledger entry has said "(a) and (a2) are **closed** by ADR-0072" throughout; what
> remains under that number is the in-process rate-limit store and the unencrypted
> OAuth token columns, neither of which is a platform foundation. Removed by the
> 2026-09-08 pass. **This is the second time this section has listed a shipped
> capability as unbuilt** — see mail transport above — in the one file that decides
> what gets built next, which is what makes it worth writing down twice rather than
> quietly deleting.

- `M` **Background processing** — BullMQ + Redis (ADR-0009). The candidate first
  consumer is schedule interchange import, which is synchronous today _(verified
  2026-09-11: no queue, job, enqueue or worker anywhere in
  `modules/interchange/`, and the controller's `commit` awaits the service
  directly)_.
  **Read [ADR-0087](adr/0087-scheduled-retention-sweep.md) D2 before starting
  this.** That decision **narrowed ADR-0009 rather than superseding it**: the
  application now runs scheduled work — one `setInterval`, no broker, no queue —
  and D2 exists precisely so "we have a scheduler" does not become the answer to
  every background need. It names the six conditions that reopen ADR-0009 as
  written: **durability across a restart, retry with backoff, exactly-once
  execution, fan-out to workers, a queue a request can enqueue onto, or visible
  progress.** An import is such a job by that ADR's own example, so this entry's
  candidate consumer is the right one — but the line above said "the decision is
  made; only the work is outstanding", and for this entry that is now only half
  true. Nobody should start a broker from this bullet without meeting one of the
  six.
- `M` **Caching** — Redis, cache-aside (ADR-0010). Measure first: no read path
  has been demonstrated to need it.
- `M` **Object storage** — S3-compatible abstraction (ADR-0011). No feature
  requires file upload yet.
- `M` **Metrics & tracing** — OpenTelemetry (ADR-0013). Includes choosing the
  backend, which is the actual decision.
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
- `S` ~~**A shape cue for the derived Unassigned band bar** (TECH_DEBT #71)~~ **— DONE
  2026-09-01**, and a widened `CheckboxField` for the bulk-selection column (TECH_DEBT #72), which
  is **half done**.
  _(Corrected 2026-09-11, the **fifth** stale claim this file has been caught on. `#71` is closed
  and ledgered: the bucket is an unfilled three-sided bracket now, decided by mocking both candidate
  remedies on a real canvas with a greyscale toggle rather than by reviewing them, after the two
  specialist reviews disagreed. `#72` is narrowed rather than open-as-written — its **target-size**
  half closed the same day (both boxes sit in a `size-6` label, 24 × 24 pointer target, painted box
  unchanged, pinned in `e2e-wbs`), and what survives is the original component finding: the boxes
  are hand-assembled where `CheckboxField` exists, which needs that primitive widened for a
  visually-hidden label and trailing row content **before** any of the five call sites move. So this
  bullet is one item, not two, and the remaining one is a shared-primitive change.)_

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
