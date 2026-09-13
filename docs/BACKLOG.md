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

> **Swept 2026-09-13 — twelve live entries examined, nine re-derived by running a command, three
> wrong.** The three not independently re-derived are **privacy operations** (its own text says do
> not start), **hosting** and **per-activity revision history**; each carries a recent dated re-read
> of its own, and saying "twelve were checked" would claim more than was done. This file's own
> closing observation is that _"nothing observes it: no gate reads this file, and
> `check:debt-status` covers `docs/TECH_DEBT.md` alone"_, so a sweep record is the only verification
> signal it can carry. Method: for each entry, take the claim that **sizes** it and re-derive it by
> running something.
>
> Wrong or overtaken: **internationalisation** (its `Intl`-throughout claim was false the day it was
> written), **branch-protection as code** (void by product-owner decision), and **performance budget
> / Lighthouse** (a bundle budget shipped; a CI frame-rate gate is refused by ADR-0128). Each is
> annotated in place rather than rewritten.
>
> Verified accurate and **not** annotated, because a paragraph saying nothing changed is padding in a
> file this long: background processing, caching, object storage, metrics & tracing (none of the
> seven dependencies is installed; `pino-http` is, which is exactly what
> [CLAUDE.md](../CLAUDE.md) §17 claims), resource-`GROUP` dissolve (dissolve exists for activities
> only), the soft-delete filter (no Prisma `$extends` anywhere), and per-activity revision history.
>
> **The contrast with the register is the reason to keep sweeping this file.** In the same session,
> four `docs/TECH_DEBT.md` rows were re-derived and **none** was wrong; nine re-derived here produced
> three. Both samples are small — but the register has a gate and had just had an item-by-item
> sweep, and this file has never had either.

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

  _(Re-derived 2026-09-13 — the first verification this entry has had, and **the sizing claim does
  not hold**. Two of its three claims are exact: `plans.currency_code` is real
  (`schema.prisma:811`), and there is genuinely **no locale machinery** — zero matches for `i18n`,
  `i18next`, `react-intl`, `useTranslation` or `@lingui` across `apps/` and in either
  `package.json`. What fails is the load-bearing one, **"`Intl` throughout"**, which is the whole
  argument for `M` rather than "a rewrite", and it fails in two unrelated ways._

  _**First, `Intl` is used and its locale is pinned.** All four shared formatters hard-code
  `'en-GB'` — `lib/format-money.ts:27,46` and `lib/format-date.ts:6,28`. That is the cheap half: the
  locale is one parameter away from being a variable._

  _**Second, and not cheap: the diagram does not use `Intl` at all.** Month labels come from two
  hardcoded English arrays — `MONTHS_SHORT` (`features/tsld/render/time-scale.ts:142`, consumed at
  `:213`) and `CANVAS_MONTHS` (`features/tsld/render/geometry.ts:187`, consumed by
  `formatCanvasDate` at `:210-215`, which builds `` `${day} ${name}` `` by hand). `time-scale.ts` is
  imported by `GanttPanel.tsx` and by `toolbar/commands/use-diagram-image.ts`, so **one English array
  labels the TSLD ruler, the Gantt ruler and the exported PNG/PDF** — the last being the artefact a
  planner sends to somebody who was not in the room. This is not a defect today: the product ships
  one locale and the labels are correct. It is a **scope** fact, and the entry asserts its opposite._

  _**Two more sites, and the awkward one is not in `apps/web` at all.**
  `features/calendars/schemas/calendar-schemas.ts:68,71` holds short and long English weekday names
  (the ADR-0067 shift editor). And `packages/interchange/src/validate.ts:758` holds `WEEKDAY_NAMES`
  whose own docblock says it exists for **"a finding a planner has to act on — `weekday 3` names
  nothing they can see"** — so that is planner-facing copy inside a **pure, framework-free package**,
  which is the hardest place in this repository to reach with a translation layer and the one a
  scoping pass over `apps/web` would never see. It is emphatically **not** format-defined text: it
  was checked for exactly that, because localising a name the XER/MSPDI format dictates would be a
  defect rather than a fix._

  _**And it was born stale, not decayed — checked, because the distinction decides the remedy**
  (`docs/TECH_DEBT.md` #58/#246). `MONTHS_SHORT` landed in `32e843f4` on **2026-07-12**; this entry
  was written in `bd011eb9` on **2026-07-28**, sixteen days later. So "`Intl` throughout" was false
  on the day it was typed, and has sized this item ever since. Periodic re-derivation is the answer
  to decay; there was never a correct value here to return to, which is why nothing recovered it for
  seven weeks. Counting the file's own series, this is the **sixth** stale claim it has been caught
  on — and the first shown to have been wrong at birth rather than overtaken._

  _**The entry is not re-sized here**, because the size is a judgement and the canvas half needs a
  real decision: the painter measures text and sits under `docs/TECH_DEBT.md` #75's draw budget, so
  "call `Intl` per label" is not obviously free. What is recorded is that **`M` rests on a claim that
  is false**, which is the thing that would have spent somebody's week. Per this file's own closing
  observation — "nothing observes it: no gate reads this file" — this was found by reading the code,
  not by any instrument, and no gate is added here (one would be a shared-gate change, ADR-0105)._

- ~~`M` **Notifications.**~~ **SPECCED, AND DEFERRED ON A NAMED TRIGGER — 2026-09-11.** The
  decision this row said was owed ("which events earn a notification and through what channel") is
  taken: [ADR-0137](adr/0137-notifications-are-a-record-and-the-build-waits-for-a-second-person.md),
  with the full spec and plan at [`docs/specs/notifications/`](specs/notifications/).

  **It is not queued work and should not be picked up as any.** The recommended recipient rule is
  "members holding a write permission, **minus the actor**"; this installation has one member, so
  that set is empty for every event kind, always. Built today it would emit **zero rows** and render
  an empty inbox — inert, not merely low-value. **Trigger: a second person holding a write
  permission in any organisation**, which is deliberately the same trigger ADR-0085 names, since
  both features exist to serve somebody who is not the person who built the product.

  _This entry has now been wrong twice, in the two opposite directions this file keeps producing._
  It first said the work was blocked on a mail transport that had shipped **a month earlier**
  (corrected 2026-09-11, the fourth stale claim found in this file and the first where the stale
  part was a _dependency_ rather than the item). Corrected, it then said what the row "genuinely
  needs" is a decision — and the decision, once taken, disqualified the build. So the row was wrong
  about being blocked, and then wrong about being ready. Kept rather than deleted, because the
  shape is the point: **a backlog row records what somebody believed when they wrote it**, and
  sizing something `M` is itself a claim that it is work.

  What survives for the day the trigger fires: the design is settled and the plan is loaded — M0's
  three falsification bars land before any harness runs, M2 is the first user-facing milestone with
  its entry point named (`/me/notifications` off the account chip), and the riskiest task is already
  isolated (the import producer must **not** sit in its transaction, because phase 2 hard-deletes
  the plan on recalculation failure). Three `database-architect` tasks are mandatory at M1/M4/M5.

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
- `S` **Branch-protection & release-bot permissions** documented as code rather
  than configured by hand in the GitHub UI.

  _(Re-derived 2026-09-13 — the first verification this entry has had, and **its first half is void
  by decision**, which makes it the **seventh** stale claim this file has been caught on (the sixth is the i18n
  entry above, found in the same pass) and the first
  where acting on it would REVERSE a product-owner decision rather than merely waste a day._

  _**There is no branch protection to document.** Measured three ways today, the same three
  [CLAUDE.md](../CLAUDE.md) §8 records for 2026-09-11: `branches?protected=true` → `[]`, `/rulesets`
  → `[]`, and `branches/main` → `protected: false`. Its absence is a **product-owner decision**
  (2026-09-11, recorded in §8 and in
  [ADR-0136](adr/0136-a-rule-is-enforced-where-the-artefact-lands.md)), not a gap — which is why
  §19.9, reading the check runs by hand, is this repository's only merge gate. Somebody picking up
  "branch-protection as code" from this bullet would codify a rule that was deliberately declined._

  _**The settings-as-code half is real, and now has a load-bearing example this entry did not
  know about.** `squash_merge_commit_title` is `PR_TITLE`, set by hand in the GitHub UI — and that
  single setting is what makes ADR-0136's `pr-title.yml` gate mean anything, because it is what
  causes the PR title to become the commit subject that lands on `main`. A gate is checking a string
  whose promotion to the commit message is guaranteed by an unversioned checkbox. That is worth
  codifying; "branch protection" is not._

  _So the accurate item is narrower and sharper: **the repository settings that shipped gates depend
  on are configured by hand and versioned nowhere.** Not re-sized here — `S` was a guess about the
  wrong subject._)

- `M` **Performance budget / Lighthouse CI** on the plan workspace — the one
  screen where regressions would actually hurt.

  _(Re-derived 2026-09-13 — **overtaken in part, and half-refused by a recorded decision**. Not
  given an ordinal in this file's stale-claim series, because it is a partial overtaking rather than
  a claim that was false; the distinction is worth keeping or the counter stops meaning anything._

  _**A performance budget now exists — for bundle size.** `pnpm --filter @repo/web check:bundle-size`
  runs in CI (`.github/workflows/ci.yml:270`) against a measured floor, landed by ADR-0136 M3 and
  recorded as closing `docs/TECH_DEBT.md` #48(b) on 2026-09-11. **Lighthouse itself is genuinely
  absent** — zero matches for `lighthouse` or `lhci` across the workflows and both `package.json`s._

  _**And the plan workspace's runtime performance already has an instrument that is deliberately not
  a CI gate.** ADR-0128 put the canvas frame-rate probe on the staff console, to run in the
  operator's own browser, because this repository's container produced a no-change baseline that
  moved 0.56 → 1.85 pp and 0.93 → 10.00 pp between two runs an hour apart against a 2.00 pp bar.
  That ADR says **"there is no CI gate here and there never will be"** (`:39`, restated at `:222`) —
  a decision, not a gap. So "Lighthouse CI **on the plan workspace**" names, in part, something
  already refused._

  _**What is actually left is narrower and is a real question nobody has answered**: page-load Core
  Web Vitals — LCP and CLS on first paint — which is a **different quantity** from canvas frame rate
  and is not covered by either the bundle budget or the ADR-0128 probe. Whether that is wanted is
  undecided; ADR-0128's refusal does not reach it, because a container can measure a page load
  reproducibly in a way it cannot measure a rAF pan._)

- `M` **Centralise the soft-delete filter** via a Prisma client extension, so it
  is enforced globally rather than repeated per repository. The cost of the
  current approach is that one forgotten `deletedAt: null` leaks deleted rows;
  the cost of the extension is a less obvious query path. Worth designing before
  building.
