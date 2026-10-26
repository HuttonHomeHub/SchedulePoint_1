# Feature Spec: Carry activity notes through XER and MSPDI

- **Status:** Accepted — shipped (ADR-0209)
- **Author(s):** feature-analyst (Claude), for James Ewbank (product owner)
- **Date:** 2026-10-26
- **Tracking issue / epic:** `docs/BACKLOG.md` "Carry activity notes through XER and MSPDI"; follows
  closed `docs/TECH_DEBT.md` #543 (the report half)
- **Roadmap link:** Schedule interchange (ADR-0050), the carry half of #543
- **Related ADR(s):** ADR-0046 (notes), ADR-0050 (interchange and its mapping contract), ADR-0156
  (a SchedulePoint value travels under an exact, namespaced label), ADR-0162 D9 (report readers
  strip unknown keys), ADR-0073 C3.4 (the import's audit row and phase 2's hard delete), ADR-0129
  (an import is always a new plan; identity across imports is the code). **A new ADR is proposed**
  (outline in §4.9).

## 1. Business understanding

### Problem

A programme's remarks do not survive interchange in either direction.

- **Import drops them.** Neither adapter reads notes. Each one counts them and adds one aggregate
  `drop` finding: `xer-adapter.ts:445-461` counts non-blank `TASKMEMO.task_memo` rows for the first
  project, and `mspdi-adapter.ts:414` with `:565-575` counts tasks that have a `<Notes>`. Both
  produce "N activity notes were not imported". The tests that pin this are
  `import-xer.spec.ts:774-815` and `mspdi-adapter.spec.ts:392-416`. #543 closed this half on purpose:
  the loss is now reported, but nothing is carried (`docs/DECISIONS.md:163-164`).
- **Export never writes them.** `xer-emit.ts` writes PROJECT, CALENDAR, PROJWBS, TASK, TASKPRED,
  RSRC, TASKRSRC and the layout user-defined fields (`xer-emit.ts:453-471`), and nothing for memos. The
  MSPDI emitter has no `Notes` leaf: a grep for `Notes` in `packages/interchange/src` finds only the
  adapter's counter and the test fixture's writer (`mspdi.fixtures.ts:158`).
- **Demand.** On 2026-10-22 the owner had to send a programme's remarks as a separate spreadsheet
  beside the XER (backlog row, `docs/BACKLOG.md:245-250`). That session turned a NetPoint programme
  into an XER for import (`docs/DECISIONS.md:179-196`), so the owner can put remarks into a file
  that SchedulePoint will read.

Re-verifying the problem statement (CLAUDE.md §19.11): checked against `main` at `aa67ab9f` on
2026-10-26. Both drops and both tests are as described, and neither emitter writes notes. Nothing
since #543 has fixed either half.

### Users

| Role                                        | Need                                                                                                        |
| ------------------------------------------- | ----------------------------------------------------------------------------------------------------------- |
| **Planner, Org Admin** (importers)          | A P6 or MS Project file's remarks arrive as activity notes, and the report says what changed on the way in. |
| **Every member** (exporters, Viewer and up) | An exported XER or MSPDI carries the plan's activity notes, so the recipient sees them in P6 or Project.    |
| **Contributor**                             | Reads and adds notes on imported activities, exactly as on activities created by hand.                      |
| **External Guest**                          | No change. Guests never see notes (`share-guest.controller.ts:59`) and cannot import or export.             |

### Primary use cases

1. **Import a P6 programme with remarks.** Each `TASKMEMO` becomes an activity note on its activity.
2. **Import an MS Project file with task notes.** Each task's `<Notes>` becomes an activity note. A
   summary task's note goes on its WBS summary activity.
3. **Export a plan to P6 or MS Project.** Activity notes travel in the file, so no spreadsheet is
   needed beside it.
4. **SchedulePoint → XER → SchedulePoint round trip.** Every activity note comes back on the activity
   with the same code, with the same text, as separate notes.

### User journeys

- **Import:** Project → **Import from file…** → choose a `.xer` or `.xml` → the dry-run report shows
  **Notes: N** under _Mapped_, plus any notes that changed or were left out → **Confirm import** →
  the new plan opens → select an activity → **Notes** on the selection bar → the imported remark is
  in the thread.
- **Export:** plan canvas → **Share & export ▾** → **Primavera P6 (XER)** or **Microsoft Project** →
  the file downloads with its notes, and the export report names anything left out (plan notes,
  notes on WBS summaries in XER).

### Expected outcomes

- Remarks move with the schedule file in both directions, for both formats.
- The aggregate "N activity notes were not imported" drop goes away for the normal case. What remains
  is a precise account of what was changed (formatting removed, long notes split) and what genuinely
  could not come across.

### Success criteria (falsifiable)

- **FC-1 (round trip, XER):** take a plan with notes on at least 20 activities, including an
  activity with three notes, a note with blank lines, a note of exactly 5,000 characters, and notes
  containing `&`, `<`, `>`, `"`, a tab and non-Latin text. Export it to XER and re-import it. Matched
  by activity code, every activity has the **same multiset of note bodies**, compared byte for byte.
- **FC-2 (round trip, MSPDI):** the same plan through MSPDI. Activities with one note come back
  byte-identical. Activities with several notes come back as **one** note whose text is the bodies
  joined by the documented separator (§4.6). That loss is reported on export, not hidden.
- **FC-3 (parity):** a file with no notes gives the same canonical model, the same import graph and
  the same report as on `main`, with no `notes` key and no new finding. The engine is not touched
  (§3, recalc parity).
- **FC-4 (compensation):** when the post-commit recalculation is forced to fail (the
  `interchange.e2e-spec.ts:586` pattern), the plan **and its imported notes** are gone, with no
  `23503`.
- **FC-5 (no rendered markup):** a `TASKMEMO` containing `<script>`, `<img onerror>` and
  `<a href="javascript:">` imports as inert plain text. The activity's Notes thread shows text, and
  the journey's axe check passes.
- **FC-6 (ceiling):** an import at the activity ceiling (5,000) carrying the notes ceiling
  (§2 Validation) commits within the phase-1 transaction's budget. This is measured in M1-T0, not
  assumed (§3 Performance). **Measured 2026-10-26 (§4.8 "M1-T0 result"): met.** At 5,000 activities,
  10,000 relationships, 200 resources, 5,000 assignments and 20,000 notes of 650 characters through the
  real commit, `persistGraph` took p50 5.6 s and at most 5.9 s over 5 runs, against a 15 s transaction
  timeout. The "20,000 notes of 1,000 characters (about 20 MB)" case cannot reach the API: the upload
  cap is 16 MiB (`interchange.constants.ts:24`), which bounds the note text of any one import to about
  14 MB.
- **FC-7 (P6 acceptance), unobserved and allowed to stay so:** whether a real P6 opens the exported
  `MEMOTYPE` and `TASKMEMO` tables and shows the notebook topic. ADR-0156 left FC-6 unobserved for the
  same reason: no P6 is available. An owner-supplied P6 export containing notebook topics is
  **optional** and would turn several assumptions in §3 into facts. Nothing in this spec depends on it.

### Open questions

Four are **critical**. Each has a recommended default, and the plan is written to that default.

- **Q1 — Who is the author of an imported note?** _Default: the importing user._ `created_by` is
  the author, and only the author may edit or delete a note (`notes.service.ts:239-247`). A null
  author would show "Unknown author" (`NoteItem.tsx:27`), and nobody could ever edit or delete the
  note, because `assertAuthor` compares `createdBy` with the caller. A third option is "importer, but
  marked as imported". That needs a provenance column: **a schema change, so a database-architect pass
  is mandatory before M1** (§4.4).
- **Q2 — How do several notes on one activity export to XER?** _Default: one `TASKMEMO` per activity,
  under one SchedulePoint notebook topic. The note bodies are joined oldest first with a horizontal
  rule, and SchedulePoint splits them back into separate notes on re-import._ The alternative is one
  `TASKMEMO` per note. That depends on P6 accepting several memos for one task under one topic, which
  is unverified here (FC-7). Both choices export bodies only. Author and date are not written (§4.6).
- **Q3 — What happens to an incoming note longer than 5,000 characters (the `ck_notes_body_length`
  ceiling, `migrations/20260719000000_notes/migration.sql:120`)?** _Default: split it, at a paragraph
  or whitespace boundary, into consecutive notes of at most 5,000 characters. This loses nothing and is
  reported._ The alternative is to cut it off at 5,000 characters with an ellipsis and report that.
- **Q4 — Does every export carry notes?** _Default: yes. Every XER or MSPDI export includes the plan's
  activity notes, and the export report says how many were written._ Every member who can export can
  already read notes (`note:read` and `interchange:export` are both granted Viewer and up,
  `org-permissions.ts:136`, `:159`), so this exposes nothing new inside the organisation. The risk is
  the file leaving it: internal remarks sent to a client. The alternative is a "Include notes" choice
  on the Export menu, which adds a new surface and grows M2.

Defaults taken without asking (change any by saying so):

- **P6 notebook topic name.** A foreign `TASKMEMO` whose topic can be named (§4.5) is imported with
  `[<topic>]` as its first line. SchedulePoint's own topic label adds no prefix.
- **RTF.** A `<Notes>` value starting `{\rtf` is not converted. It is left out and counted, and no RTF
  parser is written.
- **Plan-level notes** are not exported. They are counted in the export report. No import format read
  here carries any.
- **XER WBS memos** (a P6 table other than `TASKMEMO`) are not read. This repository has never seen
  one, and nothing in it names that table (grep for `WBSMEMO` finds nothing). Notes on WBS summaries
  are **not written to XER**, because `TASKMEMO` keys on `task_id` and a WBS summary exports as a
  `PROJWBS` row (`xer-emit.ts:356-366`). They are counted in the export report. MSPDI carries them both
  ways.
- **No import toggle.** Unlike `restoreLayout` (ADR-0156 D5), there is no "skip notes" option. The
  importer is the author, so they can delete any note they do not want.
- **No feature flag**, per ADR-0088 D1. Rollback is the commit boundary.

## 2. Functional requirements

### User stories & acceptance criteria

> **US-1** — As a **Planner**, I want a P6 programme's activity memos imported as activity notes, so
> that remarks arrive with the schedule.
>
> - **Given** an XER whose `TASKMEMO` has non-blank memos for tasks in the imported project **when** I
>   confirm the import **then** each memo is one note on the activity with that `task_id`, with
>   `created_by` set to me (Q1), as plain text (§2 Validation).
> - **Given** the dry-run **then** _Mapped_ shows **Notes: N**, where N is the number of notes that
>   will be created after splitting. The aggregate "N activity notes were not imported" drop appears
>   only for memos genuinely left out, and gives a reason.
> - **Given** a memo for another project's task, or for a task this import did not take (a dropped
>   `TASK` row) **then** it is not imported and is counted in one `drop`.
> - **Given** a blank or whitespace-only memo **then** it is ignored and not counted. This matches
>   today (`import-xer.spec.ts:801-815`).

> **US-2** — As a **Planner**, I want MS Project task notes imported as activity notes.
>
> - **Given** an MSPDI whose `<Task>` has a non-empty `<Notes>` **then** one note is created on that
>   activity. A summary task's note goes on its `WBS_SUMMARY` activity.
> - **Given** `&amp;`, `&lt;`, `&#10;` or a similar entity in `<Notes>` **then** the note stores the
>   decoded character. The parser does not decode entities (`mspdi-parser.ts:176-183`,
>   `processEntities: false`, a deliberate anti-expansion hardening). Without this step, "A & B" would
>   arrive as "A &amp; B", which `mspdi-export.spec.ts:204-208` already pins for names.
> - **Given** `<Notes>` starting `{\rtf` **then** it is not imported and is counted in one `drop`
>   ("rich-text notes cannot be read").

> **US-3** — As **any member**, I want an XER or MSPDI export to carry the plan's activity notes.
>
> - **Given** a plan with activity notes **when** I choose **Share & export ▾ → Primavera P6 (XER)**
>   **then** the file contains one `MEMOTYPE` row for the SchedulePoint topic and one `TASKMEMO` row per
>   activity that has notes (Q2).
> - **When** I choose **Microsoft Project** **then** each task with notes has one `<Notes>` element.
> - **Then** the export report says how many notes were written and how many were not (plan notes, and
>   WBS-summary notes in XER), each as one aggregate finding.
> - **Given** a soft-deleted note, or a note on a soft-deleted activity **then** it is not exported.

> **US-4** — As a **Planner**, I want a SchedulePoint XER to re-import with its notes split back
> exactly.
>
> - **Given** a file SchedulePoint exported **when** I import it **then** each activity has the same
>   note bodies (FC-1), shown in the thread in their original order.

> **US-5** — As an **Org Admin**, I want the audit log to show how many notes an import created.
>
> - **Given** a successful import **then** the `interchange.imported` row's `after` also carries
>   `noteCount`. Individual notes are not audited. Note writes are `PLAN_CONTENT` and are never
>   audited (`audit-coverage.structural.spec.ts:216`, `:297`, `:304`, `:314`).

### Workflows

**Import (dry-run and commit share the pure pipeline, so both report the same counts):**

1. The adapter reads the source notes for the first project:
   - **XER:** `TASKMEMO` rows, plus the `MEMOTYPE` topic name if one can be resolved (§4.5).
   - **MSPDI:** each `<Task>`'s `<Notes>`.
2. **The text step**, in the pure module `note-text.ts`:
   1. If the input is longer than the hostile-input bound, drop it and count it.
   2. Decode the format's escaping: XML entities for MSPDI; for XER, HTML entities when the memo is
      HTML.
   3. Convert HTML to text when the memo looks like HTML.
   4. Remove characters the database or the text model refuses.
   5. Normalise line breaks to `\n`, trim, and skip the note if it is now empty.
   6. Split at 5,000 characters (Q3).
3. The canonical model gains `notes: [{ activityId, body }]`. The mapper turns this into
   `ImportGraph.notes: [{ activityKey, body }]`, dropping and counting any note whose activity did not
   survive validation.
4. The report gains `mapped.notes` and the findings listed in §4.7.
5. **Commit, phase 1.** In the same transaction as the graph, one batched `createMany` writes the notes
   after the activities. `entityType` is `ACTIVITY`, `planId` and `activityId` come from the maps
   `persistGraph` resolves, and `createdBy` and `updatedBy` are the importer (the existing `stamp`,
   `interchange.service.ts:528`). `createdAt` is set explicitly so the thread order is deterministic
   (§2 Edge cases).
6. **Phase 2 failure.** `compensate` deletes the plan's notes before its activities (§4.3).
7. **Point of no return.** The `interchange.imported` audit row gains `noteCount`.

**Export:**

1. `ExportService.readGraph` reads the plan's active activity notes in one query, oldest first, capped
   at the notes ceiling plus one.
2. The pure mapper carries them on `ExportGraph.notes`, which is the same schema as `ImportGraph`
   (`export-graph.ts:68-69`).
3. The XER emitter writes `MEMOTYPE` and `TASKMEMO` (Q2, §4.6). The MSPDI emitter writes `<Notes>`.
   Both add their findings to the report, which travels in `X-Interchange-Report`
   (`plan-export.controller.ts:91`).

### Edge cases

| Case                                                              | Behaviour                                                                                                                                                                                                                                                                                                                                                                                                                                          |
| ----------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Several memos on one task (several P6 topics)                     | One note each, in source order.                                                                                                                                                                                                                                                                                                                                                                                                                    |
| Thread order of imported notes                                    | The thread sorts `created_at DESC, id DESC` (`note.repository.ts:165`). Import ids come from `randomUUID()`, which is v4 and random (`interchange.service.ts:1`), and one `createMany` gives every row the same default timestamp. Order would therefore be **random** unless set, so each note's `createdAt` is the commit instant plus 1 ms per note, in source order.                                                                           |
| Identical memos twice on one task                                 | Both are kept. Text is not deduplicated, because two topics saying the same thing is the file's content, not an error.                                                                                                                                                                                                                                                                                                                             |
| Memo with HTML (bold, lists, tables, images)                      | Converted to text. Block tags become line breaks, other tags are removed, and `<script>` and `<style>` contents are removed. Counted in one `approximation` "formatting was removed from N notes", but only when something beyond line structure was removed.                                                                                                                                                                                      |
| Memo containing `\u0000`                                          | Removed. PostgreSQL `text` cannot store NUL, so one such byte would otherwise roll back the **whole import**. Other C0 and C1 controls except `\n` and `\t` are removed too. Unpaired surrogates are removed, as with the swimlane names' `LONE_SURROGATE` (`xer-layout-fields.ts:114`).                                                                                                                                                           |
| Multi-line XER memo                                               | The parser re-attaches a line with no record token to the **last field of the previous row** (`xer-parser.ts:402-407`). That is correct only when `task_memo` is the last `%F` column, as in our fixture (`import-xer.spec.ts:775`). **A continuation line starting with `%` rejects the whole file** (`xer-parser.ts:398-400`). Both are recorded as risks (§3), with unit cases. The parser is not changed unless a real file shows the problem. |
| Note > 5,000 characters                                           | Split (Q3), counted in one `approximation`. Splitting never breaks a surrogate pair, so every piece also passes `char_length ≤ 5000`.                                                                                                                                                                                                                                                                                                              |
| More notes than the ceiling                                       | The first `MAX_NOTES` are kept in source order and the rest are counted in one `drop`. The plan still imports.                                                                                                                                                                                                                                                                                                                                     |
| `task_id` not among the imported tasks                            | Not imported, counted in a `drop`.                                                                                                                                                                                                                                                                                                                                                                                                                 |
| Memo for another project in a multi-project XER                   | Ignored, not counted, as today (`xer-adapter.ts:447-452`). The extra projects are already reported (`:348-356`).                                                                                                                                                                                                                                                                                                                                   |
| Export: note on a `WBS_SUMMARY` (XER)                             | Not written, counted in one `drop` (§1 defaults).                                                                                                                                                                                                                                                                                                                                                                                                  |
| Export: plan notes                                                | Not written, counted in one `drop`.                                                                                                                                                                                                                                                                                                                                                                                                                |
| Export: a note body containing characters XML 1.0 forbids (MSPDI) | Removed from the written text, so the file stays well-formed. The serialiser escapes only `& < > "` (`mspdi-serialiser.ts:55-61`). Counted in one `approximation`.                                                                                                                                                                                                                                                                                 |
| Export: a note body with tabs or newlines (XER)                   | Written as escaped HTML (§4.6). The serialiser would otherwise collapse every tab and newline to a space (`xer-serialiser.ts:36-39`) and lose the line breaks.                                                                                                                                                                                                                                                                                     |
| Re-import of a SchedulePoint XER                                  | Always a **new plan** (ADR-0050 §7, ADR-0129 Context), so a plan never receives duplicate notes. A sibling plan gets its own copy, which is correct. The ADR-0129 revision comparison correlates **activities** by code and does not compare notes. That is unchanged and out of scope.                                                                                                                                                            |

### Permissions

| Action                          | Permission (ADR-0012)                                                                                                                                                                                  | Scope                                                                              |
| ------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------- |
| Import (creates notes)          | `interchange:import`, Planner and Org Admin (`interchange-permissions.ts:11-12`). Planner also holds `note:create` (Contributor and up, `org-permissions.ts:137`), so import grants no new capability. | Target project, resolved from the caller's memberships (`resolveTarget`).          |
| Export (reads notes)            | `interchange:export`, every member (`interchange-permissions.ts:14-20`), the same population as `note:read`.                                                                                           | Target plan in the caller's organisation (anti-IDOR, `export.service.ts:113-115`). |
| Edit or delete an imported note | `note:update` / `note:delete` plus author-only (ADR-0046). With Q1's default, only the importer can.                                                                                                   | Unchanged.                                                                         |
| External Guest                  | No access to notes, import or export. Unchanged.                                                                                                                                                       | —                                                                                  |

**The pen (ADR-0028).** Note writes are **not structural**, and `NotesService` never asserts the pen
(`notes.service.ts:37-39`). The import writes notes in phase 1 inside the plan's own creating
transaction, before any pen exists, as it does for activities. Export is a read. Nothing new is
pen-gated.

### Validation rules

- **Body:** plain text, trimmed, 1 to 5,000 characters after conversion. This is the
  `CreateNoteDto` and `ck_notes_body_length` shape (`create-note.dto.ts:18-28`). No markup is stored,
  ever.
- **Hostile-input bound before conversion:** a raw memo longer than **1,000,000 characters** is not
  processed. It is dropped and counted, which keeps the text step's cost linear and bounded.
- **`MAX_NOTES` = 20,000 notes per import and per export**, counted after splitting. This matches
  `MAX_ASSIGNMENTS` (`import-xer.ts:63`), the largest existing per-import ceiling. FC-6 confirms or
  lowers it in M1-T0.
- **Characters:** remove `\p{Cc}` except `\n` and `\t`, and remove unpaired surrogates. For an MSPDI
  export, also remove characters XML 1.0 forbids.
- These rules live only in `@repo/interchange` (pure). The API trusts the graph's bodies the way it
  trusts names, so **the bounds are re-asserted by the `importGraphSchema` Zod schema**
  (`notes: z.array({ activityKey, body: z.string().min(1).max(5000) }).max(MAX_NOTES)`), and the
  database CHECK is the final backstop.

### Error scenarios

| Scenario                                                  | Detection                  | User-facing result                                                                                                                                   | Status                |
| --------------------------------------------------------- | -------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------- |
| Not a Planner or Org Admin (import)                       | `interchange:import` check | Existing forbidden message                                                                                                                           | 403                   |
| Plan not in caller's organisation (export)                | anti-IDOR load             | "This plan is no longer available."                                                                                                                  | 404                   |
| A note body still fails the CHECK (should be unreachable) | `23514` in phase 1         | The whole import rolls back, and the existing commit error path applies. A unit test asserts that the text step's output always satisfies the CHECK. | 500 → must not happen |
| Recalc fails after notes were written                     | phase 2 `catch`            | Existing failure. Plan and notes removed (FC-4).                                                                                                     | as today              |
| Memo too large, over the ceiling, RTF, orphaned           | text step and mapper       | Not an error. Import succeeds, and the report's `drop` explains.                                                                                     | 200                   |

## 3. Technical analysis

| Area           | Impact         | Notes                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| -------------- | -------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Frontend       | low            | One label: **Notes** under _Mapped_ in `InterchangeReportTable.tsx:21-41`, in the same additive-optional pattern as `placements`. No new component. Imported notes show in the existing Notes surfaces (`NoteItem.tsx:182` renders `{note.body}` as a text node). A grep for `dangerouslySetInnerHTML` in `apps/web/src` finds nothing.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            |
| Backend        | med            | `InterchangeService.persistGraph` gains a notes `createMany`. `compensate` gains `tx.note.deleteMany`. The audit `after` gains `noteCount`, and `audit-redactor.ts:179-187` gains it on the allow-list. `ExportService.readGraph` gains one notes read. The `InterchangeReport` response DTO gains `notes?`.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| Database       | none (default) | **No schema change** with Q1's default. Notes already have `body`, author, `planId`, `activityId` and soft delete (`schema.prisma:4025-4060`). Writes use the existing table and CHECK. Reads use existing indexes (§3 Performance). **If Q1 is answered "mark as imported", a provenance column is needed and the database-architect agent must design it before M1 starts.** No column is designed here.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| API            | low            | No new endpoint. Additive: `mapped.notes` in the import report (dry-run and commit) and in the export report header. Readers strip unknown keys (`report.ts:28-46`, ADR-0162 D9), so the API can ship before the web without the ADR-0156 D9 reader-first sequencing. `docs/API.md` and the OpenAPI descriptions are updated.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| Security       | med            | Hostile text from an uploaded file reaches a stored body. It is defended by converting to text and rendering only as text, bounded input length, NUL and control removal, and a CHECK backstop. **The HTML-to-text step is a fidelity transform, not a sanitiser.** Safety comes from never rendering markup, and FC-5 proves it. Export escapes both formats (§4.6), so a note cannot inject structure into the XER, the MSPDI or P6's memo HTML. A Viewer's export adds no exposure inside the organisation (Q4).                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                |
| Performance    | med            | **Phase 1 runs in one interactive transaction with a 15 s timeout** (`PrismaService`, `prisma.service.ts:25`, `:58`; this row said Prisma's 5 s default until M1-T0, and the docblock at `interchange.service.ts:483` still does). `interchange.service.ts:257` passes no override. Notes add up to 20,000 rows of text. M1-T0 **measures** the ceiling before the write lands (ADR-0142). If it breaks, the remedy is chosen from the measurement (§4.8 alternatives), not guessed. The text step is linear in input, with no backtracking-prone patterns, bounded by the 1,000,000-character cap and the file caps (the parsers allow 64 MiB, `xer-parser.ts:41` and `mspdi-parser.ts:52`, but the HTTP upload is capped at 16 MiB, `interchange.constants.ts:24`). The export read is one query: `notes_plan_id_created_at_id_idx (plan_id, created_at, id)` (`migrations/20260719000000_notes/migration.sql:80`) leads on `plan_id` and orders by `created_at, id`. M2-T1 records an `EXPLAIN` rather than asserting the plan. |
| Infrastructure | none           | No new service, environment variable or CI step. Existing suites are extended.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| Observability  | low            | The existing `interchange commit persisted a plan` and `interchange export produced a file` logs gain `notes`. Bodies are never logged.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            |
| Testing        | med            | Unit (pure package: text step, both adapters, both emitters, mapper, round trip); API e2e (commit, compensation, export, round trip, against real Postgres); one Playwright journey in `e2e-interchange` (§4 Component changes).                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   |

**Recalc parity gate.** Notes never reach `computeSchedule`. The schedule module's repository reads
no `note` table. A grep for `\bnote` in `schedule.repository.ts` finds one docblock word (`:594`) and
no query, and phase 2 calls `ScheduleService.recalculate` unchanged. A file with notes and the same
file with its memos removed give **identical engine input and output**. The API e2e asserts this by
comparing the two plans' computed dates per activity code.

**Facts this spec does not have, and does not guess** (the ADR-0071 §5 posture):

- What P6 writes in `task_memo`: HTML or plain text, and how it encodes line breaks. The design
  accepts either (§4.5).
- Whether `task_memo` is always the last `TASKMEMO` column (see the parser risk above).
- `MEMOTYPE`'s column names. A third-party Python XER parser, `jjCode01/xerparser`, describes
  `TASKMEMO` as paired with `MEMOTYPE` for notebook data, but nobody here has read its source. The
  emitter writes the minimal columns of §4.6 as an **assumption**, in the same bucket as ADR-0156's
  FC-6.
- Whether P6 allows several memos per (task, topic). This is why Q2's default writes one.

An optional owner-supplied P6 export with notebook topics settles all four.

### Dependencies

- Nothing must land first. The notes module (ADR-0046) and both adapters exist.
- **M1 (import) ships before M2 (export)**, so a SchedulePoint file carrying notes always meets an
  importer that reads them. An older importer meeting it would only count a `drop`, which is honest,
  so this ordering is a courtesy rather than a correctness requirement.
- The redaction allow-list (`audit-redactor.ts`) and the audit census (`audit-coverage.structural.spec.ts`)
  change in the same task as the producer.

## 4. Solution design

### 4.1 Architecture overview

```mermaid
flowchart LR
  subgraph pure["@repo/interchange (pure, no I/O)"]
    XA[xer-adapter<br/>TASKMEMO + MEMOTYPE] --> NT[note-text.ts<br/>decode · to-text · clean · split]
    MA[mspdi-adapter<br/>Task/Notes] --> NT
    NT --> CM[CanonicalModel.notes?]
    CM --> MP[mapper → ImportGraph.notes?]
    MP --> RP[report: mapped.notes + findings]
    EG[ExportGraph.notes?] --> XE[xer-emit<br/>MEMOTYPE + TASKMEMO]
    EG --> ME[mspdi-emit<br/>Task/Notes]
    NT -. escape helpers .-> XE
    NT -. escape helpers .-> ME
  end
  subgraph api["apps/api"]
    IS[InterchangeService.commit<br/>phase 1 createMany · compensate · audit noteCount]
    ES[ExportService.readGraph<br/>one notes read]
  end
  MP --> IS
  IS --> DB[(notes table<br/>unchanged)]
  DB --> ES --> EG
  IS -. never .-> ENG[computeSchedule]
```

### 4.2 Data flow — import commit

```mermaid
sequenceDiagram
  participant U as Planner (browser)
  participant C as InterchangeController
  participant S as InterchangeService
  participant P as @repo/interchange
  participant DB as Postgres
  participant SCH as ScheduleService
  participant A as AuditService
  U->>C: POST commit (file)
  C->>S: commit()
  S->>P: importSchedule(bytes)
  P-->>S: graph{…, notes[]}, report{mapped.notes, findings}
  S->>DB: BEGIN phase 1
  S->>DB: calendars, plan, activities, deps, resources, assignments
  S->>DB: notes.createMany (createdBy = importer, createdAt staggered)
  S->>DB: COMMIT
  S->>SCH: recalculate (pen held)
  alt recalc fails
    S->>DB: compensate: notes.deleteMany(planId) → … → plan
    S-->>U: error (nothing created)
  else ok
    S->>A: recordBestEffort(interchange.imported, noteCount)
    S-->>U: { planId, report }
  end
```

### 4.3 User flow

```mermaid
flowchart TD
  A[Project page] -->|Import from file…| B[Import schedule from file dialog]
  B --> C[Dry-run report: Mapped · Notes N<br/>+ approximations / drops about notes]
  C -->|Confirm import| D[New plan opens]
  D --> E[Select activity → Notes]
  E --> F[Imported remark in thread, authored by the importer]
  D -->|Share & export ▾| G{Format}
  G -->|Primavera P6 XER| H[.xer with MEMOTYPE + TASKMEMO]
  G -->|Microsoft Project| I[.xml with Task/Notes]
  H --> J[Export report: notes written / not written]
  I --> J
```

**Compensation (FK order).** A note is RESTRICT into both `activities` and `plans`
(`schema.prisma:4056-4060`). `compensate` therefore deletes `tx.note.deleteMany({ where: { planId } })`
**before** `tx.activity.deleteMany` (`interchange.service.ts:1521`). Otherwise the rollback raises
`23503` and leaves a half-imported plan. This is the same reasoning as the existing history and
swimlane lines (`:1514-1522`). The method is already annotated `soft-delete: any-state`
(`:1498-1502`), so the ADR-0172 gate (the structural unit suite
`common/query/soft-delete-filter.structural.spec.ts`) accepts the unfiltered delete. The
activity-history census (`activity-history-coverage.structural.spec.ts:236-247`) lists only
history-bearing tables, and a grep for `note` there finds nothing, so it needs no entry. The plan
verifies that gate's run rather than assuming it.

### 4.4 Database changes

**None with the recommended defaults.** Facts:

- `notes.body` is text, CHECK 1 to 5,000 by `char_length` (`migration.sql:120`).
- `created_by` is TEXT, the author (`schema.prisma:4050`).
- `entity_type` is `ACTIVITY`, `plan_id` is NOT NULL, and `activity_id` is set iff the type is
  `ACTIVITY` (`ck_notes_exactly_one_parent`, `schema.prisma:4033-4035`).

The import writes exactly what `createForActivity` writes (`notes.service.ts:144-154`), with ids and
`createdAt` supplied.

**If Q1 is answered "mark imported notes"** (for example a "from P6, 2026-10-26" badge), that is a new
column and **the database-architect agent is mandatory before M1 starts** (CLAUDE.md §19.3). This spec
deliberately does not shape it.

### 4.5 Import mapping

| Source                                   | Read                                                                                                                                                                                                                                                                                                                                             | Becomes                                                            |
| ---------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------ |
| XER `TASKMEMO.task_id`                   | must name a `TASK` this import took                                                                                                                                                                                                                                                                                                              | `notes[].activityId`                                               |
| XER `TASKMEMO.task_memo`                 | text step. **HTML is detected, not assumed**: if the memo contains a tag-shaped token `<[A-Za-z/!][^<>]*>`, it is converted as HTML; otherwise it is treated as plain text, and an unpaired `<` such as "x<y" is kept literally.                                                                                                                 | one note or more (split)                                           |
| XER `TASKMEMO.memo_type_id` → `MEMOTYPE` | the topic name is read **only** from a column named `memo_type`, the name the emitter writes (§4.6, assumed). If the column is absent or does not resolve, no prefix. The exact label `SchedulePoint notes v1` means a SchedulePoint memo: no prefix, and the body is split on `<hr>` back into separate notes (ADR-0156 D2's exact-label rule). | `[topic]` first line, or a SchedulePoint split                     |
| MSPDI `<Task><Notes>`                    | text step after **XML entity decode**: the five predefined entities and `&#N;`/`&#xN;`. Decoding only shrinks text, so it cannot become an expansion bomb. `{\rtf` → drop.                                                                                                                                                                       | one note or more on that task's activity (summary → `WBS_SUMMARY`) |

HTML conversion, in order:

1. Remove `<script>…</script>`, `<style>…</style>` and `<head>…</head>` with their contents.
2. Turn `<br>`, `</p>`, `</div>`, `</li>`, `</tr>` and `<hr>` into `\n`, and `<li>` into `• `.
3. Remove every other tag, then decode the named entities `amp lt gt quot apos nbsp` and numeric
   entities.
4. Collapse runs of three or more newlines to two, and trim.

The step is linear, uses no dependency, and is a hand-written tokenizer, not a regex over the whole
input with backtracking.

### 4.6 Export mapping

- **XER (Q2 default).**
  - One `MEMOTYPE` row: `memo_type_id = SPNOTES` and `memo_type = SchedulePoint notes v1`. The column
    set is an assumption (§3).
  - One `TASKMEMO` row per real activity that has notes: `memo_id`, `proj_id`, `task_id`,
    `memo_type_id` and `task_memo`, with `task_memo` **last**, so our parser's continuation rule holds
    for our own files. The table is written after `TASK`.
  - `task_memo` is HTML: each note body is HTML-escaped (`& < > "`, a tab as `&#9;`, a newline as
    `<br>`), and the bodies are joined oldest first with `<hr>` inside `<html><body>…</body></html>`.
  - Because every tab and newline is escaped, the serialiser's collapse (`xer-serialiser.ts:36-39`)
    never touches a note, so the round trip is exact (FC-1). On re-import a body that literally
    contains `<hr>` was escaped to `&lt;hr&gt;` and cannot split.
  - The table is written only when at least one note exists, as `RSRC` and `TASKRSRC` are today
    (`xer-emit.ts:462-467`). A plan without notes therefore exports **byte-identical** to `main`, which
    is the export half of FC-3.
- **MSPDI.** `<Notes>` leaf on the task: bodies joined oldest first with `\n\n————\n\n`, with
  XML-forbidden characters removed and the serialiser's existing escaping applied. A multi-note
  activity therefore round-trips as one note (FC-2), reported.
- **Not written, reported once each:** authors and dates (an `approximation` naming the count of
  notes written, "bodies only; P6 and Project show no author"), plan notes (`drop`), and WBS-summary
  notes in XER (`drop`).

### 4.7 The report

| Finding                                                                                                        | Kind            | When                                      |
| -------------------------------------------------------------------------------------------------------------- | --------------- | ----------------------------------------- |
| `mapped.notes` (optional, absent = 0)                                                                          | count           | any note created                          |
| "formatting was removed from N notes"                                                                          | `approximation` | markup beyond line structure was removed  |
| "N long notes were split into M notes"                                                                         | `approximation` | Q3 default                                |
| "N notes were not imported" plus a reason: no matching activity, rich text, too large, or over the limit       | `drop`          | one finding per reason, each with a count |
| Export: "N notes written as the P6 notebook topic 'SchedulePoint notes v1'; authors and dates are not written" | `approximation` | XER export with notes                     |
| Export: "N notes on WBS summaries / M plan notes were not written"                                             | `drop`          | when present                              |

Every finding is aggregate, never one per note, following #543. The existing
"N activity notes were not imported" wording is retired, and its two tests are rewritten.

### API changes

- No new route.
- `InterchangeReportResponseDto.mapped.notes?: number`, with an OpenAPI description, in the pattern of
  `placements` (`interchange-report-response.dto.ts:87-108`, `:262-267`).
- The `GET …/interchange/export/:format` description adds that activity notes are written.
- `docs/API.md` interchange section updated.

### Component changes

- `InterchangeReportTable.tsx`: one optional row, `{ label: 'Notes', value: report.mapped.notes }`,
  shown only when defined. This is the existing pattern, and it inherits that component's existing
  states and accessibility. No new component and no new styling.
- **Entry points:** **Import from file…** → dialog **Import schedule from file** (existing), the
  selection bar's **Notes** button (existing, `features/plan-actions/selection-actions.tsx:756`), and **Share & export ▾ →
  Primavera P6 (XER)** (existing).
- **Journey** (`apps/web/e2e-interchange/interchange.spec.ts`, extended, ADR-0081):
  1. Import a fixture `.xer` with a `TASKMEMO`.
  2. Assert **Notes 1** in the report.
  3. Confirm and open the plan.
  4. Select the activity, press **Notes**, and see the remark text.
  5. Run axe on the thread.
  6. In M2, extend the existing export→re-import test so a note survives.

### 4.8 Implementation approach & alternatives

**Chosen.**

- Model notes as a model-level array, `notes[{ activityId, body }]`, not as a field on
  `canonicalActivitySchema`. That schema is `.strict()` and its fields are about scheduling. A sibling
  array keeps the activity shape and the engine input unchanged, so no adapter that ignores notes
  changes. This mirrors how assignments sit beside activities.
- Use one pure text module that both adapters and both emitters share. Conversion and escaping
  therefore live in one place and are round-trip-tested against each other.
- Write in phase 1, removed by compensation. An import that reports N notes then actually created N,
  atomically.

**Alternatives.**

- **Write notes after phase 2, best-effort like phase 3.** Compensation would not change. Rejected as
  the default: the report would claim notes that might not exist, and the brief requires notes to be
  removed with the plan. It is kept as **the fallback if M1-T0 measures phase 1 over budget**, with
  the report then saying "notes could not be saved" on failure. A second fallback, if the ceiling
  breaks, is an explicit `timeout` option on the import transaction. That is a measured change and
  ADR-0050 B3's territory.
- **Store HTML and render it sanitised.** Rejected. ADR-0046 defines notes as plain text, nothing in
  the web renders HTML, and adding a sanitiser plus a rich renderer for imported content only is new
  attack surface for formatting nobody asked for.
- **A dependency (`html-to-text`, an RTF parser).** Rejected (CLAUDE.md §2). The conversion needed is
  small and must be bounded. RTF is left out and reported.
- **One `TASKMEMO` per note.** This is Q2's alternative.
- **A SchedulePoint `UDFVALUE` instead of `TASKMEMO`.** Rejected. The point is that P6 users **see**
  the remarks, and a user-defined field is the wrong P6 surface for prose.

**M1-T0 result (ADR-0142), taken 2026-10-26 before any production write.**

- **The stop line was set against the wrong timeout.** §3 and the plan said phase 1 runs under
  Prisma's 5 s default. It does not: `PrismaService` is built with
  `transactionOptions: { timeout: TRANSACTION_TIMEOUT_MS }` (`apps/api/src/prisma/prisma.service.ts:25`
  and `:58`), 15 s, and `interchange.service.ts` passes no override, so the import transaction has 15 s.
  The first harness used a bare `PrismaClient` and so measured against the wrong limit.
- **First reading (bare client, activities and dependencies only, 5 runs, local Postgres).** No notes:
  p50 1.6 s, max 1.9 s. 5,000 notes of 1,000 characters: p50 2.0 s. 10,000: p50 2.9 s. 20,000: p50 3.9 s,
  max 4.5 s. That was over the 2.5 s line set against 5 s and is why M1 stopped.
- **Second reading, the real path.** The throwaway spec drove `POST …/interchange/commit` with the
  note write in place, 5 runs each, and timed `persistGraph`, which is the transaction's whole body.
  Plan: 5,000 activities, 9,999 relationships, 200 resources, 5,000 assignments. With no notes the file
  is 0.6 MB and `persistGraph` took p50 2.6 s, max 2.9 s. With 20,000 notes of 650 characters the file
  is 14.1 MB and it took p50 5.6 s, max 5.9 s (5.0, 5.1, 5.6, 5.8, 5.9). The whole request, including
  parse and the phase-2 recalculation, was p50 7.7 s, max 8.1 s. The notes add about 3 s, which is
  below half of the 15 s budget (7.5 s) with the shared, noisy container as the caveat.
- **Chunking.** `note.createMany` is one call, and the splitting of its parameters across statements is
  delegated to Prisma (PostgreSQL allows 32,767 bind parameters per statement, so about 3,600 rows of
  this table go in each). The 20,000-row reading above exercised that path; an API e2e with 4,000
  notes keeps it exercised in CI.
- **Decision (product owner's coordinator): keep one atomic transaction and `MAX_NOTES` = 20,000.** No
  phase 1b and no new timeout. The fallbacks above stay documented for the day a measurement says
  otherwise.
- **What the volume ceiling really is.** The multipart upload is capped at 16 MiB, so the note text
  of one import is bounded by about 14 MB whatever `MAX_NOTES` says. 20,000 notes of 1,000 characters
  is unreachable through the API.

### 4.9 ADR required: outline

**ADR-NNNN (next free number at filing): "An imported note is the importer's, and a SchedulePoint
note travels as text under its own topic."**

- **Context:** the #543 drop, ADR-0046's author-only edit rule, ADR-0156's exact-label precedent, and
  the parser's entity and newline facts.
- **Decisions:**
  - **D1** — An imported note's author is the importer (Q1), and its timestamps are the import's.
  - **D2** — Notes are plain text. Imported markup is converted, never stored or rendered.
  - **D3** — Splitting at 5,000 characters is not a loss (Q3), and every change is reported in
    aggregate.
  - **D4** — The XER export uses one memo per activity under the exact label `SchedulePoint notes v1`,
    as HTML-escaped text, split back on re-import (Q2). MSPDI joins notes without a split.
  - **D5** — Notes are written in phase 1 and removed by compensation. The audit carries a count and
    individual notes earn no event.
  - **D6** — No schema change and no engine change, with the parity argument.
  - **D7** — What is assumed about P6 (FC-7) and what would settle it.
- **Amends:** ADR-0050's mapping-table row for `TASKMEMO` / `<Notes>`.
- **Rejected:** stored HTML, best-effort notes, one memo per note, a UDF.

## 5. Links

- Implementation plan: [`./implementation-plan.md`](./implementation-plan.md)
- Docs this change updates when built:
  - ADR-0050 mapping table (row `TASKMEMO.task_memo / <Task><Notes>`)
  - the new ADR, plus its line in CLAUDE.md §16 (`check:adr-coverage`), plus CLAUDE.md §1's ADR count
    (`check:counts`)
  - `docs/API.md`
  - `docs/BACKLOG.md` (remove the row)
  - `docs/TEST_PLAYBOOK.md`, only if a seeded catalogue case is added (optional)
