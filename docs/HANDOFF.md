# Session hand-off

The next session starts here (`CLAUDE.md` §19.14). This file is **overwritten** at each batch or
epic boundary; its history is in git.

**Written:** 2026-11-01 (early hours). The owner asked for a hand-off check (everything matched GitHub: `api` 0.103.4
and `web` 0.200.6 on #1228, both publish jobs passed in run 41226850290, #1227 to #1231 merged, no PRs open), then for a
short list of what to build next. They chose all four offered rows, **#564**, **#547**, **#556 plus the pointer drift**
and **#546**; all four are merged and released as **`web` 0.200.7** (Version Packages #1235). **No `api` release**: none
of the four touched `apps/api`, so there was no `api` changeset, no `api` tag and no `api` publish job (`api` stays
0.103.4). None needed a spec (each stayed inside its row and added no new surface, ADR-0105) and none touched the
schema. The owner's **hard rule** still stands: nothing that needs them to test, measure or check anything on their
server or devices (a decision question is fine; a test is not). **1.0 is not cut**; that stays the owner's call
(ADR-0190). **The P6 epic stays closed for what shipped (M0 to M4); M5 and M6 still wait for a real P6 export**, so do
not offer them.

## The owner's answers this session (2026-11-01)

- **Build:** all four: "Readable shaded cards (#564)", "Swimlane position kept (#547)", "Docs tidy-up (#556 +
  pointers)" (the three recommended) and "Export legend check (#546)".
- **Engineering decisions taken by the session (not asked):** the Combobox listbox name is derived from `toggleLabel`
  ("Show codes" → "Codes", capitalised; no new prop); a shaded radio card dims its title row by opacity and leaves the
  reason at full contrast; the editor's re-file reports the save first and stores the lane last; `planReparentLanes`
  keeps its `removed` guard although no layout was found where it changes the answer.

## Where things stand

- **Latest releases:** `web` **0.200.7** (tag `web-v0.200.7`), Version Packages #1235, `Release` run 41259363670: "Build & push web" passed; "Build & push api" ran and skipped every step (no `api` release). `api` is still **0.103.4** (tag `api-v0.103.4`, #1228).
- **This session's PRs, in merge order:**
  - **#1232** `docs(docs)` (#556 + pointer drift): `docs/DEPLOYMENT.md` has "Rolling back past the progressed-predecessor
    release"; rows #121, #202, #211, #263, #320, #358 and #366 re-pointed and verified 2026-10-31. **#211's "dormant"
    premise no longer holds** (`labelVisibility: 'never'` is set at 13 production sites), recorded in the row; status
    unchanged. **#358** now counts 12 sites in 8 files, not 9.
  - **#1233** `fix(web)` (#564): `RadioCardGroup` dims only a shaded card's title row (reason ~6.0:1 on the card, 4.65:1
    on the page background); `Combobox`'s listbox is named apart from its toggle via `listboxNameFor`. Reviewed by
    accessibility-reviewer and component-reviewer before release (ADR-0111).
  - **#1234** `fix(web)` (#546): `data-chrome="legend"` and `data-chrome="strip-caption"` are on the export chrome
    roster; ADR-0200's Consequences note amended in place.
  - **#1236** `fix(web)` (#547): the editor's General save (when `parentId` changes) and Dissolve store the movers'
    swimlane lanes through the shared `useStoreReparentLanes`; census pinned. ADR-0206's known-gaps sentence updated.
  - **#1235** Version Packages (the one release, `web` only).
- **The P6 epic:** M0 to M4 shipped and recorded in ADR-0210. **M5 and M6 wait for a real P6 export** that uses activity
  codes (`m0-record.md`); the approved `plan.md` M5/M6 is their spec.
- **Pointer drift:** cleared (#1232). None outstanding from the 2026-10-31 pass.
- **New, no row (from #1236's review):** `ActivityEditorDialog.tsx` now imports `@/features/wbs` (feature-to-feature,
  an existing direction already used by `ActivitiesTable.tsx`); a seam would remove it. Cosmetic; not worth a row
  unless #548's tidy-up runs.

## The reconciliation pass (2026-10-31)

Recorded in `docs/DECISIONS.md` and `docs/RECONCILE.md`. Found wrong and fixed: the silent export loss (#1223); every
reviewer agent ignorant of codes, and `security-reviewer.md`'s guest rule false for a code-grouped plan (five agents now
carry the codes invariants); ROADMAP's ADR-0207 still "ships with the next release"; `DATABASE.md`'s soft-delete model
count (21 → 23); `PROJECT_BRIEF.md` calling codes a follow-on; two `scripts/surface-contract.json` `gap` rows for dialogs
that shipped. Rows #74, #279, #549, #552, #557 and #562 corrected in place; none resolved. **Pointer drift recorded, not
fixed:** #121, #202, #211, #263, #320, #358, #366, #560 (#560 has since been closed, #1230; the other seven were re-pointed by #1232). **Not run:** step 5a (the clone is shallow).

## The three host steps: DONE on 2026-10-20

Later on 2026-10-20 the owner asked to do them and was guided through them in the same chat (full record
in `docs/DECISIONS.md`, 2026-10-20). `docs/RELEASE_1_0.md` rows 5, 6 and 7 are **Done**.

- **Backups:** on. Folder `/apps/schedulepoint/backups` on the owner's server (stacks live in `/apps`,
  not `/opt/stacks`; the terminal is Dockge's own, signed in as root, so no `sudo`). `CHECK PASSED` on
  `schedulepoint-2026-10-20T1601Z.dump` and on `schedulepoint-2026-10-20T1632Z.dump`. `.env` saved.
- **Export:** `schedulepoint-export-wood-group-20261020T1615Z.zip`, opened and correct.
- **Clear-out:** **ON** (`RETENTION_HIERARCHY_ENABLED=true`). The compose file needed the pass-through
  line added first. The first run removed 9 Wood Group test clients deleted 2026-07-21; `…T1632Z` is
  the copy taken just before. More test clients from late July and August expire over the next weeks,
  as the owner saw on the preview and in Recently deleted.
- The guides were corrected where they did not match the server. New row **#536** (the Audit log names
  the clear-out "Unknown"; the bin and the preview round days left differently).
- **For the alerts step, when the owner returns to it:** their compose file already sets
  `MAIL_ALERT_URL` (an ntfy topic) and `HEARTBEAT_URL`, but the heartbeat URL reads
  `https://hc-ping.com/my-first-check`, which looks like an unfinished placeholder. Check it then; do not
  raise it before.

## Decided — do not re-ask

- **Hard rule (2026-10-18, restated 2026-10-19 and 2026-10-20):** offer nothing that needs the owner to
  test, measure or check anything on their server or devices. Decision questions are fine.
- Do not cut 1.0 until the owner says.
- The clear-out is switched on only by the owner, on a day a backup `check` has passed.
- Export size: accept the current design; do nothing about the 100-plan estimate unless the owner raises
  it (`docs/specs/organisation-export/m2-measurements.md`, #515, #516).
- Collaborative editing is not in 1.0.
- Four web e2e shards; the fifth-shard trigger is the slowest shard above 1,250 s (median of three runs)
  or a 30-minute timeout. No fifth shard.
- The diagram keeps its own colours under a Windows contrast theme (#508).
- `Start editing` stays plain while the pen is not held.
- The `View ▾` panel's Zoom and Colour-by radio rows stay 24 px under a coarse pointer; the 420 px bar holds (#561, 2026-11-01).
- The default database password is warned about, not refused (2026-10-16).
- Metric tiles: the shared look everywhere, no boxed option (2026-10-16).
- The combobox's disabled-option behaviour ships before any screen uses it (2026-10-16).
- Redundant links: zero or negative direct lag still counts (W5 loosened, 2026-10-17).
- The export's float columns are named `…Days`, format 2.0 (2026-10-17).
- 2026-10-18 batch answers (all in `docs/DECISIONS.md`): #242 remove the prefill; #116 quick taps are one
  undo; #403 show both cues; #223 included when showing, every layer; #519 refuse with defaults and bring
  the project calendar back; #368 Route A; #234 defer the text-only states, load early, cautious contract,
  and the four SC amendments; #382 gate ~150 activities; #58 the tint follows the switch; #271 paging
  not now.
- 2026-10-19 answers: #522 near-critical is ≤ 5 working days of the activity's own calendar; #523 amber
  inside sRGB; #533 the health panel keeps its spinner; #534 Members loading/error states; #76 flag-off
  journey (Option A); #69 keep both row-edit idioms; #64 Viewer summary / shaded editors for a pen-less
  Planner; the WCAG 2.5.3 header fix is "both fixes"; password reset stays sequential.
- 2026-10-20: #535 as its spec; #307(a) skip-the-placeholder default; #88 no sign-in on Confirm;
  a `**Verified:**` date dates the whole row (A8a/A8b).
- 2026-10-21: the five specs with every default.
- 2026-10-22: the three specs with every default and the CQ answers above; #306 (a) declined.
- 2026-10-22 (evening): the shortlist order, #536 "System", #543 report only, and the seven
  swimlane answers above (SQ-7 yes).
- 2026-10-23: swimlanes M0/M1 (SQ-1 to SQ-6 defaults, SQ-7 yes); CI install "time limit + retry"
  and "keep the packages".
- 2026-10-24: accept the swimlane row growth (35 → 54 rows on the torture plan).
- 2026-10-25: swimlanes M3 and M4 built to the approved spec with no new owner decisions; the
  defaults taken are recorded in ADR-0205 (guests) and the ADR-0156 amendments (XER reader and writer).
- 2026-10-25 (evening): swimlanes M5 only; the three known gaps stay follow-ons ("None now").
- 2026-10-26: the shortlist (#539, #550, #495, #371; spec both import items), the four specs with
  every default, and Dependabot #1153 to #1162 left for later; then "merge the Dependabot PRs now".
- 2026-10-27: the P6 follow-on is built (keep the codes in the plan, per plan); the spec approved with every
  default; Q1 baselines yes-if-under-1-second (the fallback shipped); close Dependabot #1161; one release at the end.
- 2026-10-29: P6 M3 (values on demand; Gantt prints code columns, as many as fit, naming the rest; Set a
  code from the table and the diagram); the M3 spec approved; the `values=none` 70 ms miss accepted.
- 2026-10-30: P6 M4 with every recommended answer (keep drawing past 100; Move to swimlane… offers the bands on
  screen; guests see "No <type>"); "current code only" for code lanes; the baseline capture miss accepted.
- 2026-10-31: ADR-0210's outline as written; the export gap is reported ("say so in the report").
- 2026-10-31 (evening): build #549 and #552, plus #560 (over "none for now"); #564, the pointer list, #562 and
  #563 not taken.

## Parked by the owner — keep, do not raise

The owner parked these (`docs/DECISIONS.md`, 2026-10-13; reaffirmed 2026-10-15, 2026-10-16, 2026-10-17,
2026-10-18, 2026-10-19, 2026-10-20, 2026-10-21, 2026-10-22 and 2026-10-24). A session does not bring them up until the owner does. When the
owner returns to one, the steps are ready:

- **Set up the alerts** with `docs/guides/set-up-alerts.md` (~15 minutes on the host; do the test part at
  a quiet time). When a test alert reaches the owner's phone, close #100.
- **Run the device check sheet** (`docs/specs/pre-1-0-hardening/device-check-sheet.md`, ~1½–2 hours in two
  sittings). The owner replies with one line per step; record the answers in a `device-check-results.md`
  beside the sheet and turn each "wrong" into a row or a fix.
- Older parked items, unchanged: the toolbar "minor tweaks" (#499 — ask which before building any),
  SC-16 photos, 72 rem confirmation, Surface sheet steps 25, 18b, 25b, 26–28, the history count on or
  after 1 November, Gantt hands-on readings, header at 320/640.
- The 1.0 checklist lists both parked jobs as "the owner's call" with no position; keep it that way.

## Open rows worth knowing

- **#306** is now only (a): the hook's name, folder and `toolbarLabel` option are toolbar-specific
  while a tree uses it. Declined this session (a public contract change for no behaviour change).
- **#313** is only the one Firefox-only failure of 2026-09-13; its trigger is "read that run's
  trace first, the next time a base-journey sign-up wait fails on CI".
- **#532** is only the Members table's placeholder rows being 4–8 px shorter than settled rows (needs
  a `Column` prop, a component contract: ADR-0105 spec trigger). Accepted known gap.
- **#271** stays open for cursor paging (owner: not now).
- #507 (no exported OpenAPI file; owner's call), #508 (by decision), #321 (deferred on a trigger),
  #391 and #395 (remaining painter items), #509, #510, #512, #513 and #515–#517 (deferred on triggers;
  #509 is the off-site copy: today's copies live on the same disk as the database).
- **Decided 2026-10-19 — leave it:** better-auth 1.7.10 makes a reset atomic only when the adapter runs
  transactions; ours runs the steps in order (fail-closed; a crash mid-reset spends the link).
- **From 2026-10-23:** **#544** (a project-calendar restore racing its project's delete fails
  now and then under CPU load; not reproduced on CI) and **#545** (`e2e-local.sh api backup` refuses
  its own check because the run-lock session is connected; run the fixture and the check directly).
- **The CI browser-install hang is fixed** (#1114, #1117); no row was needed.
- **No new rows on 2026-10-24.** Every M2 review finding was folded into its own task's PR.
- **#547** (2026-10-25): the activity editor's Breakdown field and Dissolve do not store the moved
  activity's swimlane lane (derived on read, so nothing overlaps on screen). Every other M3 and M4
  review finding was folded into its own task's PR.

- **New on 2026-10-25 (M5):** **#548** (`features/tsld` imports other features against ADR-0026 §8;
  ten files predate swimlanes and `model/reparent-lanes.ts` was added by M3-T2), **#549** (above),
  **#550** (a top-level activity create did not take the plan lock; closed 2026-10-26 by #1164).
  **#536** is closed (2026-10-22); the host-steps section above still calls it new because it records
  that day.

- **New on 2026-10-26:** **#551** (a browser crash reaches nobody), **#552** (three small UI slips),
  **#553** (writers that attach to an existing activity may have #550's race), **#554** (a reused
  resource keeps its own calendar, so the file's differing copy is created and bound to nothing),
  **#555** (the cross-plan twin has no weekend calendar), **#556** (the #421 marker has no rollback
  section), **#557** (ADR-0196's exclusion may now be over-conservative),
  **#558** (a labelled `CheckboxField` row is 24 px under a coarse pointer), **#559** (a new plan takes
  the Standard calendar without the calendar lock). **#550** and **#371** are closed.
- **New on 2026-10-27:** **#560** (a note create could land under an activity or plan a delete swept an instant
  earlier; **closed 2026-10-31 by #1230**), **#561** (the toolbar's hand-rolled radio rows stay 24 px under
  a coarse pointer; growing them breaks the View panel's 420 px bar), **#562** (the codes API's deferred items:
  a values-on-demand read, `?include=deleted` unbounded, the write response returns every code, the redundant
  lock re-take in `bumpVersions`, the unreproduced 2.6 s history flush, and the cascade's **60 s ceiling of about
  2.3 million values in one project or client restore**). **#553**, **#558** and **#559** are closed.
- **Also noted, no row:** the web form's client-side swimlane name regex (`features/swimlanes/model/swimlane-names.ts`)
  still covers only C0/C1, so a name with a line separator is refused by the API with a 422, which is cosmetic.
- **Untested, no row:** dragging a milestone onto a non-working day (ADR-0207 changed how a placed
  finish milestone reads back; only a journey can check the drag).

- **2026-10-29 (M3):** no new rows. **#562** was updated in place: its first, second and eighth items are
  closed; the deleted-values sort is recorded with a trigger (a type with more than about 10,000 deleted
  values); the write's full answer, `bumpVersions`, the history re-measure, the required-`codes` DTO, the
  pen check and the 60 s sweep ceiling stay open with their reasons.

- **2026-10-30 (M4):** **#563** (stored code lane rows for values an activity no longer holds are kept for ever, so
  the plan-wide lanes read grows; nothing stale is sent any more) and **#564** (two pre-existing shared-primitive
  issues the T5 review found: a shaded `RadioCardGroup` card dims its reason to about 2.6:1, and the `Combobox`
  listbox shares its name with its toggle; neither primitive was changed).
- **Also noted, no row:** the seeder printed "LOCKED on recalculate" for every plan during local swimlanes runs; the
  suites passed and it was not investigated. `e2e-swimlanes` took about 6.4 minutes locally against its 190 s
  estimate in `scripts/e2e-durations.json`; this container runs far slower than CI, so judge it from CI step times
  (ADR-0138's fifth-shard trigger is the slowest shard above 1,250 s).

## Suggested next

**The P6 epic is closed for what shipped.** Nothing in it is buildable until a real P6 export with activity codes
arrives (M5 keeps them on import; M6 writes them to an XER, with the reader released first, ADR-0156 D9). Never on
guessed column names (ADR-0071 §5).

- Ask the owner what to build next; offer only from the open register and backlog, not the parked items.
  `docs/BACKLOG.md` has nothing buildable today (every entry has shipped, waits on an outside trigger, or is P6), so
  the list comes from `docs/TECH_DEBT.md`.
- Small open rows checked 2026-10-31/11-01 as still real and not yet offered or taken: **#554** (an import's unused
  calendar copy; needs a spec), **#551** (a browser crash reaches nobody; needs a channel, so likely an owner
  decision), **#555** (the cross-plan twin has no weekend calendar; on a trigger), **#548** (`features/tsld` imports
  other features). **#561** is closed by decision (2026-11-01).
  **#562** and **#563** stay on their own triggers.
- **#211** may be worth re-offering: its long-press finding now reaches 13 icon-only production items, not two.
- The next reconciliation pass is due at the next epic boundary (last full pass 2026-10-31).

Still offer only if the owner raises it: row 9 at the 1.0 cut.

## Environment notes a new session would otherwise rediscover

- **Run every e2e suite that touches what you changed, not just the suite named in the plan.** Two
  CI reds this session came from suites nobody ran locally: View ▾'s height is asserted in
  `web:workspace-fit` (`assertViewPanelFitsTheFloor`, ≤ 420 px at 1024 × 600), and widening the Gantt
  grid moved a row's centre under the divider in `command-surface.spec.ts`. Grep `apps/web/e2e*/` for
  the component or test id before choosing suites.
- **`scripts/e2e-local.sh web:arrange` fails in this container at org creation ("Unauthorized")**
  (seen 2026-10-24, cause not found); CI runs it green. Leave it to CI rather than chasing it locally.
- **One local database, one DB-backed run at a time.** Builders in parallel worktrees took turns on
  Postgres by an explicit "DB free" hand-off from the orchestrator; non-DB work (code, unit tests,
  lint, reviews) ran in parallel. A builder cannot receive a message mid-run, so it stops and waits.
- **Rebasing parallel branches:** both `docs/TECH_DEBT.md`'s closed ledger and `CLAUDE.md`'s web
  file count conflict between any two PRs that close a row or add a file. Keep both ledger rows (and
  check for a duplicated row when a later commit edited one); the count can merge cleanly and still be
  wrong by one — always re-run `pnpm check:counts` after a rebase.
- **A fresh worktree's `pnpm prepush` fails lint/typecheck** until `pnpm --filter @repo/api exec prisma
generate` has run and stale `.eslintcache` files are deleted. Turbo can stop other test tasks after
  the known `@repo/interchange` failure; run `pnpm --filter @repo/web test` (or `turbo run test
--filter='!@repo/interchange'`) to confirm.

- **`send_later` works in a session the product owner started.** Arm it as the first action of each turn;
  re-arm only on a firing. A fired notification can be delivered minutes late, so an empty
  `list_triggers` can mean one fired and is still on its way (2026-10-19); arm one if it is empty and
  work is in flight. **`delete_trigger` the last one when the chain ends.**
- **The GitHub and claude-code-remote MCP tools disconnect and reconnect mid-session.** Reload with
  `ToolSearch select:mcp__github__<name>`; the repo is `HuttonHomeHub/SchedulePoint_1`.
- **`ss` is not installed in the container.** Pick high random free ports with a `python3` socket bind
  check. **Never `pkill` by pattern**: a reviewer's `pkill -f "nest start"` once risked other agents'
  servers; start servers under `setsid` and kill your own **process group**.
- **Isolated stack for a journey:** API —
  `cd apps/api && API_PORT=<p> BETTER_AUTH_URL=http://localhost:<p> CORS_ORIGINS=http://localhost:<vite> DATABASE_URL=postgresql://app:app@localhost:5432/app_test?schema=public BETTER_AUTH_SECRET=local-e2e-secret-at-least-32-characters-long RATE_LIMIT_LIMIT=400 pnpm exec nest start`;
  web — `cd apps/web && VITE_API_URL=http://localhost:<p> pnpm exec vite --port <vite>` (**no `/api/v1`**);
  then `PLAYWRIGHT_SKIP_WEBSERVER=1 E2E_BASE_URL=http://localhost:<vite> PLAYWRIGHT_CHROMIUM_PATH=/opt/pw-browsers/chromium … --project=chromium`.
  **Each Playwright config has its own `VITE_` flags and API env — copy them from the config**, and make
  sure no leftover server from a previous suite answers the next one (it cost two builders a false round).
  Run journeys **serially**; parallel runs cause sign-up timeouts.
- **API rate limit:** the activities `POST` is throttled at 100 per 60 s per IP per handler. A suite that
  seeds heavily sets `RATE_LIMIT_LIMIT` in its config's `webServer` env (narrow-shell: 400,
  workspace-chrome: 1250). Local runs hid this for a day.
- **CI renders text slightly differently from this container** (a label measured 103.7 px on CI against
  106.2 here). The promotion width assertion (SC-18a) is therefore one-sided-strict plus a bounded 4 %
  narrower allowance; re-take the JSON on the CI runner (ADR-0128) rather than widening it if it flags a
  label. The 120 px stage-floor assertion in `e2e-minimap/viewport-cluster.spec.ts` has two pixels of
  margin and cannot be confirmed against CI fonts.
- **Text-only 200 % in a journey** uses a CDP `Page.setFontSizes`, kept attached and re-applied if the root
  size reads 16 px (`narrow-shell.spec.ts`, `setDefaultFontSize`). It passed here on both Chromium builds;
  the CI fix `ac49e0a` is the defensive version of a guess — if SC-7 ever reads `16px` on CI again, set the
  default font size as a browser-level preference instead.
- **The account suite needs a random `E2E_SMTP_PORT`**; its default fixed ports collide with other runs.
- **Parallel branches collide on shared numbers.** TECH_DEBT row numbers and the `CLAUDE.md` / `README.md`
  banner counts (web source files, ADRs) clash when two PRs are open; rebase every branch onto the latest
  `origin/main` before opening it and re-run `pnpm check:counts` and `check:debt-status`.
- **Subagents sometimes have no shell**: brief builders to commit and push after every green slice
  (`chore(web): wip …`, never a bare `wip`), and to stage explicit paths only.
- **A fresh worktree needs** `pnpm install --frozen-lockfile`, `pnpm --filter "./packages/*" build` and
  `pnpm --filter @repo/api exec prisma generate` before lint will pass; `scripts/e2e-local.sh --db-only`
  starts Postgres.
- **The shell always mounts an empty `role="status"` live region** (ADR-0179): scope any e2e
  `getByRole('status')`. Signed-in e2e below 1024 must opt in with `acknowledgeViewportNotice`.
- **A test in `apps/web/e2e-workspace-chrome/plan-switch.spec.ts` flaked** under load; the `newPlan` helper had a race (it skipped the project
  link click if the Explorer had not drawn it) and now waits for whichever of the link or the "New plan"
  button appears first (fixed; #435 is now closed).
- **A stale API server on :3000 poisons later local runs** (`curl -s localhost:3000/api/v1/health` should
  return nothing). Never let two DB-backed runs overlap.
- **CodeQL flags `new StorageEvent('storage', { key })`** and stat-then-read directory walks; use
  `apps/web/src/test/storage-event.ts` and `readdirSync(dir, { withFileTypes: true })`.
- **`check:counts` trips on every new web source file** (the `CLAUDE.md` banner count); a new test file
  counts too. Adding an ADR also moves the ADR count.
- **The container restarts without warning** and kills agents; pushed branches and wake-ups survive.
  **`.claude/worktrees/` must be in `.git/info/exclude`** in each fresh container.
- **The Version Packages PR's checks never run** (`action_required`); read its diff (`get_files`), then merge
  it with its head SHA. **Never** `actions_list list_workflow_runs` (its output is huge).
- **`gh api …/jobs/<id>/logs` is blocked by the proxy**; use the MCP `get_job_logs` — its tail is mostly
  Postgres service-container noise, so delegate log reading to a read-only agent and filter for
  `✘` / `Error:` / `Expected` / `Received`.
- **The `@repo/interchange` "decodes CP1252 high bytes" test fails in the container only**, so
  `pnpm prepush` reports `FAILED: test`; `check:reconcile-due` warns on the shallow clone. Both are
  pre-existing. Run `pnpm --filter @repo/web test` on its own.
- **A PR title over ~93 characters fails `pr-title.yml`**; commit bodies ≤ 100 characters per line.
- **ADR-0131's spec gate reads the first word of `Status:`**; an ADR citing a Draft spec's path fails
  `check:spec-status` S3.
- **Playwright in the container:** set `PLAYWRIGHT_CHROMIUM_PATH=/opt/pw-browsers/chromium` (a link to
  the installed build; it was `chromium-1194`, on 2026-10-24 it was `chromium-1243`, so never hard-code
  the numbered folder). Never run `playwright install`.
- **The Surface sheet rule:** `docs/specs/gantt-coarse-pointer/device-checklist.md` must change in the
  same PR whenever what it tests changes (touch rows, dividers, targets).
- **A tooling auto-commit can sweep staged files into a commit titled `chore(...): wip ... (not yet
verified)`**; the squash-merge hides it, but do not be surprised by it in a branch's log.
- **Builders must rebase onto `origin/main` and run `prettier --check` on `docs/specs`** before opening a PR;
  unformatted agent-written specs failed CI's format check once.
- **The Stop hook checks the orchestrator's current directory.** `cd`-ing into a builder's worktree makes that
  worktree the checked directory, and a worktree that is mid-rebase must not be committed into.
- **A `pr-title.yml` run can show a `cancelled` twin beside a success** after a description edit; the dedupe
  handles it. The Version Packages PR appears 1-2 minutes after a merge. A relayed `check_suite` event can
  name an older head: always read the check runs for the current head.
- **`pnpm measure:toolbar -- <name>` ignores the filter** and runs every measure spec, rewriting
  `docs/specs/toolbar-redesign/photos`. Run one spec with
  `pnpm exec playwright test --config playwright.measure-toolbar.config.ts <spec>`; `M0_TAG=after` on
  `toolbar-grid-m0.spec.ts` writes only `docs/specs/toolbar-grid/photos/after-*`.
- **A worktree without `node_modules` cannot run the husky hook** (lint-staged not found). Either run
  `pnpm install --frozen-lockfile --prefer-offline` in it, or format and lint the commit message from the
  main checkout (`pnpm exec prettier --write`, `pnpm exec commitlint --edit`) before committing.
- **`changeset-release/main` is updated 1–10 minutes after a merge**; poll it with `git ls-remote` rather
  than listing workflow runs. The tag (`web-vX.Y.Z`) lands about a minute after the Version Packages merge.

- **Batch-2 lessons (2026-10-14):**
  - **A reviewer pass before the database run saves a round.** Every milestone's first design had a
    blocking finding (#978's Highlight-filled selected row failed three reviewers at once); folding
    reviews while another builder held the database kept the queue moving.
  - **Merging one web PR conflicts the next** on `CLAUDE.md`'s web file count and `docs/TECH_DEBT.md`'s
    open sections. Resolve the register by deleting both closed rows' open sections (both ledger lines
    already exist) and let `pnpm check:counts` name the right banner number.
  - **Hold the Version Packages PR open to batch** several web patches into one release; re-read its
    `get_files` after the last merge and pin the merge to its head SHA.
  - **`get_check_runs` answers for the PR's current head**; confirm the head with `pull_request_read get`
    when a push and a check start are seconds apart.
  - **A builder's notification can arrive without its report**; read the branch with `git ls-remote` and
    `git log` rather than waiting.
  - **`cd`-ing into a builder's worktree** moves the Stop hook's checked directory; `cd` back at once.
  - **Long `vitest run` and `turbo run test` exceed the 10-minute foreground limit**; run them in the
    background.

- **1.0-requirements lessons (2026-10-14):**
  - **Never wait with `while pgrep -f "<name>"`** inside a shell whose own command line contains
    `<name>`: it matches itself and loops for ever. This session lost half an hour to one, and a
    builder left two (`until ! pgrep -f "vitest run"`). Wait on a PID or a lock file instead.
    `pkill -f <script>` has the same trap and is worse: on 2026-10-24 it killed the shell that ran
    it. Find the PID with `ps -eo pid,args | awk` and `kill` that, or wait on a file.
  - **Builders worked in worktrees on local branches and never pushed**; the orchestrator
    cherry-picked their range onto the designated branch, ran `pnpm prepush` plus the e2e suites,
    and pushed. Brief each builder with the exact base SHA.
  - **`e2e-overview` "the landing shows what changed…" takes ~31 s in this container** against the
    30 s default and fails on timeout only (no assertion); CI runs the whole overview suite in about
    1.3 minutes. Treat a local timeout there as the sandbox, and confirm on CI shard 4.
  - **CI's `image` job keeps backups in `/tmp/schedulepoint-backups`** (`BACKUP_DIR`), because the
    build context cannot descend into a uid-1000 mode-700 `./backups`. A step that recreates the
    `api` container loses its first-boot log, so the job saves it first.
  - **A second restore in the same minute** once collided on the kept database's name; the script now
    picks a free name (#993). Keep that regression case in `scripts/backup-restore-check.sh`.

- **2026-10-15 lessons:**
  - **The main checkout has no `node_modules`.** Run `pnpm prepush` and the e2e suites in a builder's
    worktree, moved onto the exact head you will push (`git checkout --detach <sha>`), then `cd` back.
  - **A builder's run script wrote `/api.pid` and `/vite.pid` at the filesystem root**, and the safety
    check refuses any `rm` at `/`. They are harmless; brief builders to write pid files inside their
    worktree or the scratchpad.
  - **The Stop hook counts commits against the branch's old remote tip** after a squash-merge and a
    reset, so it asks for a push while `pnpm prepush` is still running. Wait for the gate; push with
    `--force-with-lease=<branch>:<old-sha>`.
  - **A scheduled wake-up whose notes go stale can be corrected in place** with `update_trigger` (new
    prompt), which avoids a second live trigger.

- **2026-10-16 lessons:**
  - **A worktree agent that finishes with no changes has its worktree removed.** Resuming it with
    `SendMessage` lands it in an empty folder (every tracked file shows as deleted). Start a fresh
    builder instead of asking it to restore the tree; nothing was lost.
  - **Two background runs writing one log file interleave.** Give every gate run its own log name
    (`prepush-<row>.log`), or a finished first run's tail is read as the second run's result.
  - **A stalled `playwright install --with-deps` can time a shard out** (12 m 43 s on 2026-10-16 against
    ~2 minutes). Read the job log before treating a 30-minute cancel as suite time; one re-run is
    allowed because no test body was slow.
  - **Two API fixes touching `OperationalModule` and `PrismaService`** were each tested on their own
    base; the second was re-run (full API e2e, unit, prepush) on top of the first before it was pushed.
    Do that whenever two parallel branches touch the same module.
  - **`docs/TECH_DEBT.md`'s closed ledger conflicts on every second closing PR**; keep both rows.
  - **A test that overrides `PrismaService` with a bare `PrismaClient`** (`activity-history-statements`)
    breaks when `PrismaService` grows a method a constructor calls; give the stub the method.

- **2026-10-16/17 lessons:**
  - **Merge one PR at a time and rebase the next onto `main` just before.** Every PR that closes a row
    touches `docs/TECH_DEBT.md`'s closed ledger, so every second merge conflicted. Rebasing in parallel
    only multiplied the work.
  - **In a rebase, "ours" is `main` and "theirs" is the commit being replayed.** A helper that let "theirs"
    win on a duplicate ledger row silently put back `main`'s older wording of #303. Check every duplicate
    row by hand, drop hunks where both sides deleted rows, and confirm `git diff origin/main --
docs/TECH_DEBT.md` shows only that PR's rows.
  - **After rebasing onto a dependency bump, run `pnpm install --frozen-lockfile --prefer-offline` (and
    `prisma generate`) in the worktree before `pnpm prepush`.** Without it `check:claims` fails ("verified
    against 12.1.3, 11.2.7 is installed") on code that is fine.
  - **Tell read-only reviewers never to check out a branch in the main checkout** (`git show` and
    `git diff` only). One left `/home/user/SchedulePoint_1` detached on a feature commit, which deleted an
    untracked working copy other builders were reading.
  - **A red-first Playwright probe is cheap and decisive for focus bugs.** The #481 probes showed one copy
    was fine in Chromium and the other really dropped focus. Reading the code alone had guessed the
    opposite risk for the strip. For TanStack Query refetches in a probe, dispatch `visibilitychange` on
    `window` and wait past the 30 s stale time.
  - **The container restarted once mid-session** (about 01:00); worktrees, pushed branches and the
    wake-up survived, and nothing was lost.

- **2026-10-17 lessons:**
  - **API e2e reads `@repo/types` and `@repo/interchange` from their built `dist`.** After checking out a
    commit that changes a package, run `pnpm --filter "./packages/*" build` first, or a journey fails on
    a stale type (it cost one false red on redundant-link M2).
  - **Turbo stops `api` and `web` tests after the known interchange failure.** `pnpm prepush` then reads
    "11 cached, 14 total"; re-run `npx turbo run test --continue` to see the rest actually pass.
  - **A review fold that rewords copy must re-run the journeys that read it.** #1035's fold reworded the
    retention sentence and left `e2e-recently-deleted` asserting the old one; it was caught by running the
    suite on the exact head before merge, not by CI. Grep `apps/web/e2e*/` for the old string.
  - **The replay helpers** (`resolve.py`, `replay.sh` in the session scratchpad) take ours for count
    banners, union ADR lines keeping the **longer** line (an amendment), and keep both ledger rows. They
    must **not** touch `docs/BACKLOG.md`/`ROADMAP.md` (it duplicated an entry) — resolve those by hand.
    A cherry-pick paused on an empty commit is not "done"; check for `CHERRY_PICK_HEAD`.
  - **Stack the whole batch in one worktree, validate it once, then cherry-pick slice by slice onto
    `main`** after each squash. When `git diff <tested-sha> HEAD` is empty, the gate result carries over.
  - **This machine (15 GB, 4 cores) cannot run two `pnpm prepush` at once** — they OOM or time out — and
    some unit files flake under load (ActivityEditor progress drafts, promotion anchors/manifest, the
    Gantt "Stop editing" step). Re-run a failing file alone before believing it.
  - **A menu-probe click must hit the part of the button the open menu does not cover**, and the toolbar
    suite runs with `VITE_CANVAS_AUTHORING=false` — put an authoring probe in `e2e-authoring`. Confirm
    every probe red on the old code.
  - **A test server started under `setsid` saves setsid's PID, not the server's.** Find it by its
    `API_PORT` in `/proc/*/environ` and kill its process group.

- **2026-10-18 lessons:**
  - **Check a gate's exit status directly, never through a pipe.** `node scripts/check-counts.mjs | tail -2 && …`
    reports `tail`'s success, so a failing count looked green once; the next slice caught it.
  - **`e2e-audit/org-export.spec.ts`'s axe scans now wait for animations to end** (`scanWhenSettled`): the
    Download button changes variant and sits under the pointer, so an immediate scan read half-way colours
    (4.17:1, 2.22:1) and failed 3/3 on a docs-only PR. Settled colours pass (15.3:1 / 17.4:1). If that scan
    flakes again, look past the transition. A repeated local run of it trips the export endpoint's
    100-per-60 s rate limit; space runs a minute apart.
  - **A restack must include every commit the feature branch grew since the stack was built**, not only the
    newest ones; a builder found two missing predecessors (modify/delete conflict on a test file) and picked
    them first.
  - **The main checkout shares the designated branch with the `pr` worktree.** After `checkout -B` in the
    worktree, the main checkout's files lag its ref and the Stop hook reports hundreds of staged changes.
    Confirm the index matches an older `main` (`git write-tree` against `rev-parse <sha>^{tree}`), then
    `git reset --hard HEAD` there; nothing is lost.
  - **A PR title must stay at or under ~92 characters** before GitHub's ` (#NNNN)` suffix; #1052 failed at 94.
  - **The Version Packages branch is rebuilt about a minute after each merge**; wait for its SHA to change
    (`git ls-remote origin refs/heads/changeset-release/main`) before merging it, then pin that SHA.

- **2026-10-26 lessons (the second Dependabot batch):**
  - **Never copy a whole `package.json` from a Dependabot branch.** Its branch is cut from an older
    `main`, so the copy brings old content with it. Doing that for #1177 to #1185 set `@repo/api` back to
    0.101.1 and `@repo/web` to 0.199.2 (below the `api-v0.102.0` / `web-v0.200.0` tags), and each
    later copy lowered ranges an earlier one had raised. The lockfile kept every resolved version, so
    nothing installed changed, but Version Packages proposed **0.101.2 / 0.199.3**. #1186 fixed it.
    Edit only the lines the Dependabot PR changes (`git diff origin/main...origin/<branch>`).
  - **Before merging Version Packages, compare its versions with the latest tags**
    (`git ls-remote --tags origin`). A release must never propose a version below one already tagged.
  - **virtual-core 3.19 reads the scroller's `clientHeight`**; a jsdom test that stubs only
    `offsetHeight` renders no rows.

- **2026-10-19 lessons (the Dependabot batch):**
  - **Regenerate a rebased bump's lockfile with lowest-direct resolution.** Taking `main`'s lockfile and
    running a plain `pnpm install --no-frozen-lockfile` resolved nodemailer `^10.1.1` to **10.1.7**, a
    version nobody had reviewed. `pnpm install --no-frozen-lockfile --config.resolution-mode=lowest-direct`
    lands each bump on exactly the version its PR names; then confirm with `--frozen-lockfile` and that
    a second plain install changes nothing. Read the whole `git diff origin/main -- pnpm-lock.yaml`
    package list, never a `tail` of it.
  - **Dependabot's own rebase rewrites more than its package** (it drifted half a dozen unrelated
    transitive packages on #1056) **and can retitle the PR past the length limit.** Prefer the pnpm
    regeneration and re-check the title after every Dependabot rebase.
  - **Stale `node_modules/.pnpm` copies trip `check:claims`** ("more than one copy in the store") after
    a worktree changes branch. Delete every `node_modules` and reinstall frozen before believing it.
  - **`scripts/dependency-claims.json` conflicts on every rebase** in the `verifiedAgainst` block. Both
    sides are pins; keep the higher version of each package. Never take one side wholesale.
  - **A new axe-core minor can enable a rule by default.** Four scans run without `withTags` and so
    run every enabled rule; that is where 4.14's `label-content-name-mismatch` surfaced. axe counts
    `aria-hidden` text as visible for that rule (`visibleVirtual(..., false)`).
  - **Keep squash titles at or under ~92 characters before ` (#NNNN)`** — the commitlint limit applies
    to the subject that lands on `main`, and the merge tool does not check it.
  - **Pushing to a Dependabot branch is fine** (it stops Dependabot rebasing that PR); use
    `--force-with-lease=<ref>:<sha just read with ls-remote>`.
  - **Run the long local e2e while CI runs**, and merge only when both are green — it saved a full
    cycle per PR.

- **2026-10-19 lessons (evening: the reconciliation pass and the follow-up rows):**
  - **The container restarted twice in about half an hour** (22:35 and 23:02). Background shell runs
    die with it; pushed branches, local branches, the scratchpad and scheduled wake-ups survive.
    Postgres does not come back on its own: `scripts/e2e-local.sh --db-only` restarts it. Re-run any
    log that ends without its `EXIT` line.
  - **`list_triggers` can be empty while a fired wake-up's notification is still on its way** (one
    arrived three minutes after it fired). When it is empty and work is in flight, arm one anyway
    (CLAUDE.md §19.12); if the late one then arrives, do not arm a second.
  - **Union-merging `docs/TECH_DEBT.md` in a rebase is unsafe**: it brought closed rows' sections back
    (A5 findings) and once doubled the whole ledger (685 rows). What worked: keep `main`'s file through
    every conflicted step (`git checkout --ours`), then re-apply the branch's own closures (delete its
    `### N.` sections, add its ledger rows) from a saved copy of the branch's file, and check that
    `git diff origin/main -- docs/TECH_DEBT.md` is only those rows.
  - **A union merge of `CLAUDE.md` duplicates the banner lines**; keep one and let `pnpm check:counts`
    name the numbers.
  - **A guard that closes a hole can break a journey that used the hole as setup.** #530's narrowing
    refusal broke `apps/web/e2e/recently-deleted.spec.ts` on CI shard 2 (a deterministic 409 in all
    three browsers). Grep `apps/web/e2e*/` for the request a new refusal blocks, not only for the UI.
  - **`apps/web/e2e-netpoint-grammar/support.ts` seeds through `http://localhost:3000`** (hard-coded).
    Run that suite with the API on port 3000, or its seeding tests fail with `fetch failed`.
  - **A reusable isolated-stack runner** lived at `scratchpad/suite.sh` this session (random ports,
    own database, kills only its own process groups). Rebuild it from the "Isolated stack" note above
    if needed; give each suite's `VITE_` flags from its config.
  - **The org-export journey is `apps/web/e2e-audit/org-export.spec.ts`** (there is no
    `e2e-org-export` folder). Its axe scans now switch transitions off before scanning (#1070).

- **2026-10-20 lessons (#535):**
  - **A fresh worktree needs `pnpm turbo run build` for the packages before vitest**: the builder
    found `@repo/types` had no `dist` even after `pnpm --dir <worktree> --filter "./packages/*" build`
    had exited 0 from the main checkout (why was not established). Run the build from inside the
    worktree and check for `packages/types/dist`.
  - **`react-hooks/set-state-in-effect` refuses clearing state in an effect.** Reset state that
    follows a prop during render (`if (!canManageLogic && editingId !== null) setEditingId(null)`)
    and keep only the announcement in the effect.
  - **jsdom's `<dialog>` does not return focus on `close()`.** A focus-return claim (AC4) needs a
    Playwright step; the unit test can only show the dialog closed and the opener survived.
  - **Releasing the pen server-side from a journey** (`fetch DELETE …/edit-lock` in
    `page.evaluate`, then wait ≤ 25 s for the 15 s status poll) is the reusable way to test "the pen
    is taken under you" while a modal covers the toolbar (#64's and #535's journeys).
  - **After a squash-merge and `checkout -B` onto `main`, the Stop hook reports an unpushed
    commit**; push with `--force-with-lease=<branch>:<old remote sha>` to sync the branch.

- **2026-10-20 lessons (#307(a), #263(i)):**
  - **Another chat may edit this file at the same time.** The owner's device/host chat had a PR open
    (#1085) rewriting the host-steps sections here while this session wrote its hand-off. Change
    only your own sections, so the two diffs touch different lines and merge cleanly.
  - **After a merge, the Version Packages PR's `get` can show the old head for a minute** even once
    `git ls-remote` shows the rebuilt `changeset-release/main`. A merge pinned to the new SHA then
    fails `409 Head branch was modified`; re-read `get` until its `head.sha` matches, read
    `get_files` again, then merge.
  - **A stale local `origin/<branch>` ref breaks `--force-with-lease`** when the remote branch no
    longer exists (`stale info`). Check `git ls-remote` first; delete the tracking ref
    (`git update-ref -d refs/remotes/origin/<branch>`) and push plainly.
  - **Check a row's symptom in the code before fixing it.** #263(i)'s literal symptom had already
    gone; the fix that remained was smaller and different.

- **2026-10-20 lessons (#88 and the gate repairs):**
  - **`check:debt-status` now refuses an undated row.** Every row whose status is not `unverified`
    needs `**Verified:** <date>` inline in its header line (after `·`, or opening a wrapped header
    line). A new row without one fails A8b; an `unverified` row with one fails A8a.
  - **`check:claims` now fails on a registered claim nothing cites.** When a change removes the
    last citation of a `scripts/dependency-claims.json` entry, delete the entry in the same change.
  - **A literal file name followed by a colon and a line range (in a doc, a comment or a fixture) reads as a citation** to
    `check:claims`; build such strings with `join` in tests.
  - **Stack the next PR on the one under review in its own worktree** (`git checkout -b x <head>`,
    cherry-pick, run `pnpm prepush`). After the squash, the merged tree equals the tested head, so
    the stacked tree carries over unchanged; only `docs/DECISIONS.md`'s top entry conflicted.
  - **A page reached by a hash-only navigation does not remount** (`/verify-email` then
    `/verify-email#token=…`); listen for `hashchange` when the hash carries the input.

- **2026-10-21 lessons (the seven-row batch):**
  - **Never run a gate as `pnpm -s <gate>` in this container.** Inside a `pnpm` script, the nested
    `pnpm` (`/root/.local/share/pnpm/.tools/pnpm/10.4.1`) turns a script's exit 2 into 1 when output is
    silenced, so an advisory WARN reads as a FAIL (`check:doc-register`'s `prepush:push` test failed that
    way). Plain `pnpm <gate>`, as CI and `pnpm prepush` run it, is fine. Brief builders the same way.
  - **Never type a command you have not read back.** A stray `ln -sf . /dev/null` replaced `/dev/null`
    with a link to `/dev`; every `>/dev/null` then failed with "Is a directory" and two e2e suites died
    before starting. The safety check (rightly) refused deleting it; a container restart restored it.
    Re-run any suite whose log shows "Is a directory".
  - **`scripts/e2e-local.sh` always uses ports 3000 and 5173**, so only one suite can run at a time.
    Builders wrote code and ran unit tests and gates in parallel worktrees; the orchestrator ran every
    e2e suite serially (queued with `until grep -q ALLDONE <previous log>`), and handed the database to
    one builder at a time when a builder had to iterate on a journey.
  - **A journey split out of a long one must copy its set-up.** The new baseline-delete test captured a
    baseline before recalculating; it passed locally once and failed CI 3/3 in Chromium.
  - **A row's own "five call sites" or "still open" can be wrong.** #72 had three; #165 (b) and (e)
    were already done. The feature-analyst caught both by reading the code before writing the spec.
  - **Resolving `docs/TECH_DEBT.md` in a rebase:** take the other side's file, re-apply only the
    replayed commit's own change with `git diff <commit>^ <commit> -- docs/TECH_DEBT.md | git apply -3`,
    then settle the ledger conflict by keeping every row (and the newer wording of a row both sides
    edited). `docs/DECISIONS.md`: keep both top entries, newest first.

- **2026-10-22 lessons (the shortlist batch):**
  - **A rebased branch that predates a script change runs the OLD script.** The #538 worktree was
    cut before #308 landed, so `e2e-local.sh web:x -- -g …` ignored the filter and ran the whole
    suite. Check `git merge-base` before relying on a tool another PR in the batch changed.
  - **A fresh worktree's API e2e needs its own `prisma generate`.** Every web suite failed at
    `webServer` start with `$transaction does not exist on PrismaService` until it ran.
  - **The new `prepush` output is worth reading now:** a red gate prints its `✗`/`×` lines and a
    "showing K of N lines; run `pnpm <gate>`" footer instead of a 12-line tail.
  - **Two gate PRs that read each other's files ship together:** #299 parses `prepush.sh`, which #276
    changed; they were stacked, validated once, and merged as one PR (#1102).
  - **Brief builders without the database and run every e2e suite yourself, serially.** Three
    builders and two reviewers ran in parallel with the orchestrator's e2e queue; only lint once ran
    out of memory (re-run with `NODE_OPTIONS=--max-old-space-size=8192`).

- **2026-10-22/23 lessons (the import batch and the swimlanes spec):**
  - **The container restarted about every 25 minutes overnight** (20:45, 21:34, 22:28, 22:55,
    23:22). Every long local run died with it. What worked: run each gate as its own short
    background script under `setsid nohup`, with an `EXIT` line and an `ALLDONE` marker, and
    re-run whatever has no marker; split `turbo run test` into `pnpm --filter @repo/web test` and
    `--filter @repo/api test`.
  - **A worktree can lose its generated Prisma client** after a restart and a rebase: 74 API unit
    files then fail with `Cannot find module '.prisma/client/default'` while every test that loads
    passes. Run `prisma generate` before believing it.
  - **`pkill`-by-pattern's cousin bit too:** a loop that killed every process whose command line
    held a script's name killed the shell running the loop (exit 144). Kill a saved PID's group.
  - **A new refusal breaks journeys that used the refused case as set-up** (again, as #530 did):
    #541's dry-run 409 broke two API e2e cases that previewed a re-import under the same name.
  - **A "never regenerated" digest moved by a wording fix** is explained in the test, not
    re-baselined: hash with the old wording put back and assert the new wording separately.
  - **Squash-detection for the branch list:** a branch is on `main` when `git merge-tree` against
    `main` changes nothing, or its whole `merge-base..branch` diff's `patch-id --stable` matches a
    `main` commit, or every file it touched equals `main`'s. Check commits `main`'s docs cite against
    `refs/pull/*/head` before calling a branch safe.
  - **feature-analyst wrote into the main checkout** even when resumed from a worktree; the
    ui-architect and database-architect passes ran in parallel safely by each writing its OWN new
    file in the spec folder and leaving the spec to the analyst's fold.

- **2026-10-23 swimlanes lessons:**
  - **The container restarted about every 20 to 25 minutes** this session, killing Postgres and any
    long run. Start long jobs with `setsid nohup <script> > log 2>&1 &` (a script that prints one
    `name=$?` line per step and a final `EXIT`), wait on the log, and bring Postgres back with
    `scripts/e2e-local.sh --db-only`. A full API e2e takes about 15 minutes, so start it straight
    after a restart (`uptime`).
  - **A spec that creates swimlane rows must delete them in `afterAll`**
    (`await clearDomainData(prisma).catch(() => undefined)`). Leftover swimlanes met other specs'
    `plan.deleteMany` and failed 45 unrelated tests in one full run.
  - **A new child table moves the statement-count and tree-clear pins** (`clear-activity-tree`,
    `clear-baseline-tree`, `activity-history-statements`). Expect to update them in the same PR.
  - **A schema CHECK must survive `pg_dump`/`pg_restore` text-for-text**: `BETWEEN` on the left of an
    `AND` came back rewritten, and the backup round trip in CI failed on it (`docs/DATABASE.md`).
  - **The export 429 test waits on the export's own advisory lock**
    (`hashtext('org-export')`, `objsubid = 2`); a general "any advisory lock" wait saw the run lock.

- **2026-10-25 swimlanes M3 + M4 lessons:**
  - **The container restarts about every 20 minutes** (seen many times in one session). A long local run
    dies with it and leaves no summary line. Start a run straight after a restart, one at a time,
    from a **resumable script** (skip steps already recorded as `name=0`), and let **CI be the
    runner for the long suites** (`workspace-fit`, `gantt-editing`, the full API suite). The full API
    suite takes ~15 minutes, so a run only finishes if it starts in the first few minutes of a
    container's life; to check a few specs, run them directly: export
    `DATABASE_URL=postgresql://app:app@localhost:5432/app_test?schema=public`, run
    `scripts/e2e-local.sh --db-only`, then `pnpm --filter @repo/api test:e2e test/<spec>` (without the
    URL every spec reads as "skipped" and the run exits 0).
  - **A timeout can look like a hang.** A journey step that waits for a button renamed in a later UI
    fix sits silently until the 5-minute test timeout; the log shows nothing between the last passing
    test and the end. Run the one test with `-g` and a hard `timeout`, and read the failure context
    before suspecting the product. The same journey's later steps had never run because step 5 failed
    first.
  - **A spec that creates swimlane rows must clear them in `afterAll`** (the 2026-10-23 lesson held
    again): leftovers made `schedule.e2e-spec.ts` fail 35 tests in `beforeAll` on
    `swimlanes_plan_id_fkey`. Wrap the reset in `try/finally` and call `clearDomainData(prisma)`.
  - **A schema CHECK and a unique index are the reader's contract.** Anything that writes a name
    must be at least as strict as `ck_swimlanes_name_shape` (`[[:cntrl:]]`, which also counts
    U+2028, U+2029 and U+FFF9 to U+FFFB) and as the `lower()` fold behind
    `uq_swimlanes_plan_name` (per code point; U+0130 folds to `i`). One refused name inside the import
    transaction would roll the whole import back. The API e2e sweep over every code point proves it
    against Postgres.
  - **Rebasing a stack after a squash:** `git rebase --onto origin/main <old base>` replays the
    review-fold commits too and conflicts on `CLAUDE.md`'s banner count. Resolve by taking main's
    side, then set the number `pnpm check:counts` names; `git rebase --skip` a commit that only fixes
    the count. Push with `--force-with-lease=<branch>:<old remote sha>` read from `git ls-remote`.
  - **Brief a builder to put the way forward in every refusal,** and to fold review findings in the
    same branch: the accessibility reviewer blocked two tasks on "a reason that points at itself"
    and "no keyboard route"; both were cheap to fix before merge and expensive after.
  - **`list_workflow_runs` is fine when filtered:** `resource_id: release.yml`, `perPage: 1`,
    `workflow_runs_filter: {branch: main, event: push}`, then `list_workflow_jobs` on that run id.

- **2026-10-25 swimlanes M5 lessons:**
  - **Seven read-only reviewers in parallel finished in about a minute each** and needed only a scoped
    brief (the commit range, the milestones to weight, and the gaps not to report). Verify every
    finding in the code before folding: two of seven suggestions were wrong for this repo (a deep import
    that is deliberate for chunk size, and copy the approved plan specified).
  - **`pnpm turbo run lint --filter=@repo/web` can die with exit 134 (out of memory)** in this
    container; re-run with `NODE_OPTIONS=--max-old-space-size=8192`.
  - **`prettier --check .` flags six files nobody owns** (`apps/api/scripts/*.mts`,
    `prototypes/tsld-spike`); use `pnpm check:format`, which is what CI runs.
  - **A long ADR title re-aligns the whole `docs/adr/README.md` table** under prettier (400 lines of
    churn). Use the short form of the title in the index; `check:adr-coverage` reads the number.
  - **A claim that a rule "held" is checkable:** `grep` the imports on the tree before and after the
    epic. ADR-0026 §8 did not hold, and the ADR says so.

- **2026-10-26 lessons (reconciliation pass and the shortlist):**
  - **jsdom has no modal inertness.** A focus hand-off that runs while a `showModal()` dialog is open
    passes every unit test and fails in every real browser, because `focus()` on anything outside
    the modal does nothing. A unit test can still catch it: record whether `dialog[open]` exists at
    the moment the hand-off calls `focus()`. TanStack v5 runs a hook-level `onSettled` (and awaits a
    returned promise) **before** the callbacks passed to `mutate()`, so a list that refetches to empty
    can unmount the host before its `onSuccess` closes the dialog.
  - **Run a new journey locally before pushing it**, even when CI will run it:
    `PLAYWRIGHT_CHROMIUM_PATH=/opt/pw-browsers/chromium scripts/e2e-local.sh web -- e2e/<spec> --project=chromium`
    takes about a minute. Without the variable Playwright asks for a browser build the container
    does not have.
  - **The Prisma transaction budget is 15 s** (`TRANSACTION_TIMEOUT_MS`, `prisma.service.ts`), not
    5 s; a builder that stops at a guessed budget needs the real one.
  - **Assemble stacked PRs in one scratch worktree** and rebase each with `git rebase --onto
origin/main <old base>` after the one below merges; union the ADR lines, take ours for the counts
    and let `check:counts` correct them, and re-add new TECH_DEBT rows numbered contiguously.
  - **Run `pnpm check:*` plainly, never `pnpm -s`**: the silent flag turned a WARN into a FAIL for
    `check:doc-register`. Prettier needs the repo's `node_modules` (its Tailwind plugin), so check a
    worktree without one from the main checkout with absolute paths.
  - **A builder's assertion can land in the wrong test when two tests end the same way.** The note
    round-trip check went into the layout-restore test, whose last lines match the export-then-
    reimport test's, so it read an empty list on CI. Read a builder's journey diff hunk by hunk
    against the test it claims to extend, and run the suite locally before the PR.

- **2026-10-27/28 lessons (the P6 build):**
  - **A changeset whose frontmatter lacks `: patch` silently stops the release machine.** Two of mine named
    the package without a bump type (`'@repo/api'` on its own line); the Release workflow's step "Create release
    pull request" failed on every merge from #1190, so the Version Packages PR stopped updating and nothing
    said so. Frontmatter must be exactly `---\n'@repo/api': patch\n---`. When the release PR looks stale, read that
    step: `get_job_logs` with `return_content: true` and `tail_lines: 110` on the Release run's first job.
  - **`actions_list list_workflow_runs` without `perPage: 1` floods the context** (it ignored `per_page`; the
    parameter is `perPage`). Always pass `resource_id: release.yml`, `perPage: 1` and the branch and event filter.
  - **A format version that shipped cannot be reused.** Organisation export 2.2 shipped in `api` 0.102.2 (it
    carried migration A's enum label), so migration B's additions had to be **2.3**; the builder had checked the
    tags before the release and was right at the time. Check `git ls-remote --tags` again at the point of
    deciding.
  - **After a squash-merge of a base PR, rebase the next one with `git rebase --onto origin/main <old base head>`**
    in a scratch worktree, then force-push with the old head as the lease. It was clean every time.
  - **Prisma's nested `connect`/`disconnect` misbehave on the composite relations** (`connect` rewrites the plan's
    primary key; `disconnect` is silently dropped; two connects sharing a column: the last wins). Write them
    through plain columns; `nested-relation-writes.structural.spec.ts` fails on any nested write.
  - **Measure before keeping a design (ADR-0142).** The baseline code snapshot measured 2.4 to 2.8 s against the
    owner's 1 s ceiling, so the approved fallback shipped; a project of ten maxed plans measured 17 s against the
    15 s transaction default, so the delete and restore got the 60 s one. Both were found by a builder that
    stopped and reported instead of deciding.
  - **A container restart kills running builders and Postgres, but a builder's uncommitted edits survive in its
    worktree under `.claude/worktrees/`.** Relaunch a builder into the same path (no new worktree), run
    `scripts/e2e-local.sh --db-only` first, and have it commit and push before any long run.
  - **`Monitor` with a timer loop emits an event per tick.** Do not use it to wait; use the wake-up and an
    `until` loop on a log or `git ls-remote` in a background shell.
  - **`cd` into a worktree moves the tool's working directory** (the environment notice says so). Use
    `git -C <path>` and absolute paths, and `cd` back at once.
  - **The GitHub MCP tools can disconnect mid-session.** Reload with `ToolSearch select:mcp__github__<name>`.
  - **Reviewers found real things, each cheap before merge:** the org-export index shape `(organization_id, id)`
    for a linear keyset scan; the line separators the database refuses but the DTO did not (the swimlane DTO had
    the same gap); a missing `details.reason` on a 409.

- **2026-10-29/30 lessons (P6 M3, the codes screens):**
  - **Stacked builders work: one task per worktree, each based on the previous task's head.** After each
    squash-merge, `git rebase --onto origin/main <old base head>` moved the next one cleanly; the conflicts were
    only `CLAUDE.md`'s web file count (take either side, then set what `pnpm check:counts` names) and the odd
    shared journey helper. A builder will refuse to force-push its own branch; do that rebase yourself.
  - **`src/styles/token-architecture.test.ts` caps screen-placed font weights at 132 and must never be
    raised.** Two new screens each added one `font-semibold`/`font-medium` and failed CI's unit job. Brief
    builders up front: no `font-medium|semibold|bold|normal` outside `components/ui/`.
  - **Playwright's `toBeDisabled()` counts `aria-disabled`**, so it can never pass for a shaded-but-focusable
    control. Assert no native `disabled` and that it takes focus.
  - **A screen-reader-only (`sr-only`) span is `position: absolute`;** with no positioned ancestor below a
    dialog it stretched the dialog's scroll height (963 px) while every pane looked bounded. `relative` on the
    pane fixed it; only the 1024 × 600 journey could see it.
  - **Two document-capture `keydown` listeners on one node run in registration order**, so a popover that
    opened first swallowed a combobox's Escape. `usePopoverPanel` now yields to an open inner
    `[role="combobox"]` (ADR-0111 reviewed); a unit stand-in hid the order, the real Combobox in the test does not.
  - **Journey locators must be scoped to the control's own listbox** (`aria-controls`): the diagram's search
    list also had a "Roof" option and broke `getByRole('option', { name: /Roof/ })`.
  - **A merge-conflict fix can leave a formatting difference** that only `pnpm check:format` catches; run it
    after every hand-resolved conflict.
  - **The announcer writes its text one animation frame later** (`requestAnimationFrame` in
    `components/ui/announcer.tsx`), so a unit test must `waitFor` it; an immediate check passed locally and
    failed CI's unit job once (#1209).
  - **Four reviewers in parallel per task, then one fold builder,** kept each PR to one CI round; the UX
    reviewer caught real copy defects every time (a false "no activities" count while loading; bare "Code").

- **2026-10-30/31 lessons (P6 M4, swimlanes by a code):**
  - **Stacked builders on unmerged branches work, if each rebase drops what is already upstream.** T3 to T6 were
    built on top of each other before T1 to T5 merged; after each squash, `git rebase --onto origin/main <old base
head>` moved the next one. A local "wip stack" merge commit of an unmerged sibling (T2 under T3) must be dropped
    on the rebase, and git drops a duplicate fix by itself ("patch contents already upstream").
  - **A builder that runs only some gates misses the rest.** T6 ran `check:e2e-roster` but not
    `check:doc-register`, so `scripts/e2e-durations.json`'s recorded total went stale and CI's unit job failed. Brief
    builders to run the whole `bash scripts/prepush.sh --checks` (no tests, a few minutes).
  - **A paired measurement, not two medians minutes apart.** T1's first lane-write figure (+220 to +288 ms) was the
    machine's drift; pairing each "with" against a "without" run back to back gave about +120 ms. Even paired, a
    7-pair median moved from +102 to +199 ms, so record a range when the spread exceeds the ceiling (ADR-0076).
  - **A refused kill is not mine to do on a builder's behalf.** A builder's own leftover test server held port 3000
    and the safety check refused its kill; I checked the processes read-only, asked the owner, and only then stopped
    them by exact id. Brief builders to start servers under `setsid` and stop their own process group.
  - **CI's "Set up Node.js" can stall for 10 minutes** and push a web shard past its 30-minute limit (#1214 shard 2:
    every test step passed, then the time ran out). Read the job's step timings before believing a cancel; one
    re-run was justified.
  - **Playwright waits for an `aria-disabled` control to become enabled**, so pressing a shaded-but-focusable button
    hangs to the test timeout; press it with `force: true` and assert nothing opened.
  - **A text locator finds both copies of a shaded control's reason** (the `sr-only` description and the printed
    paragraph): locate the visible paragraph.

- **2026-10-31 lessons (P6 M7, the gate pass):**
  - **A gate pass finds real defects, not only prose.** Checking ADR-0210's interchange decision against
    `export.service.ts` found codes and a code source dropped silently on export. Read each "not yet built" claim's
    export and import paths, not only the feature's own module.
  - **Stack documentation PRs and validate once at the top.** Five branches were built on each other; one full
    `pnpm prepush` ran on the top, `scripts/prepush.sh --checks` on each lower head, and after each squash
    `git rebase --update-refs --onto origin/main <old head>` (worktrees on the lower branches detached first) moved the
    rest with `git diff <tested top> HEAD` empty, so the result carried over.
  - **Web lint ran out of memory in `pnpm prepush`** (exit 134) on a fresh container; `NODE_OPTIONS=--max-old-space-size=8192`
    on the whole run fixed it.
  - **The proxy refuses deleting a remote branch** (`git push --delete` hangs up). Leave merged branches.
  - **A plan's amendment list can name the wrong ADR.** The guest change belonged on ADR-0205 (which already amends
    ADR-0051 §4) and ADR-0156's planned change had not shipped; check each target against the code first.

- **2026-10-31 evening lessons (#549, #552, #560):**
  - **Three builders in parallel worked when only one owned the database.** The two web builders ran unit tests,
    lint and typecheck only; the API builder ran Postgres, the API e2e and its own prepush. Then the orchestrator ran
    `pnpm prepush` on each exact head, one at a time.
  - **A full `pnpm prepush` catches what a builder's targeted tests miss.** #552's builder ran the palette, overview,
    float-paths and Gantt tests; the full run failed `export-image.test.ts`, which asserted the theme palette's
    fallbacks were dark. Read a builder's "all pass" as "the files I named pass".
  - **Stack the next fix on the PR under review, then cherry-pick it onto `main` after the squash.** When
    `git diff <tested head> HEAD` is empty the gate result carries over; each move was clean, and the only conflict
    was the closed ledger (keep both rows).
  - **A ledger row's last cell is padded to the widest row,** so lengthening the widest row repads another row under
    prettier. Put a long note in the code or the row's open section instead of the closed ledger.
  - **Killing a finished builder's leftover test process is refused** by the safety check; leave it, it ends on its own.
  - **A body line starting `word:` reads as a footer** to commitlint (`footer-leading-blank` warning); harmless, and
    only the squash title lands on `main`.
