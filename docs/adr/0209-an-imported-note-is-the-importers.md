# ADR-0209: An imported note is the importer's, and a SchedulePoint note travels as text under its own topic

- **Status:** Accepted
- **Date:** 2026-10-26
- **Deciders:** Product owner (feature spec Q1 to Q4, every default taken, 2026-10-26)
- **Amends:** ADR-0050 (the mapping row for `TASKMEMO` and `<Task><Notes>`)
- **Follows:** ADR-0046 (notes), ADR-0156 (a SchedulePoint value travels under an exact, namespaced label), ADR-0162 D9
  (report readers strip unknown keys), ADR-0073 C3.4 (the import's audit row and phase 2's hard delete)
- **Spec:** [`docs/specs/interchange-notes/`](../specs/interchange-notes/) (feature spec and implementation plan)

## Context

A programme's remarks did not survive interchange in either direction. Both adapters counted notes and reported one
aggregate drop (closed `docs/TECH_DEBT.md` #543), and neither emitter wrote any, so on 2026-10-22 the owner sent a
programme's remarks as a spreadsheet beside the XER. The target already existed: activity notes (ADR-0046), which are
plain text of 1 to 5,000 characters, edited and deleted only by their author.

Four facts about the surrounding code shaped the decisions:

- A note's author is `created_by`, and `assertAuthor` compares it with the caller. A note with no author could never be
  edited or deleted by anyone.
- The XER parser re-attaches a line with no record token to the **last field of the previous row**, skips blank lines,
  and rejects a whole file on a continuation line starting `%`. None of that is changed here.
- The MSPDI parser runs with `processEntities: false`, so `<Notes>` arrives with `&amp;` and `&#10;` still in it.
- Import phase 1 is one interactive transaction. `PrismaService` gives it **15 s** (`prisma.service.ts:25`, `:58`); the
  spec and plan said Prisma's 5 s default until the first measurement corrected them.

## Decision

**D1 — An imported note's author is the importer, and its timestamps are the import's.** `created_by` and `updated_by`
are the importing user, so the existing author-only rule applies unchanged: the importer can edit or delete every note
they brought in, and nobody else can. Imported notes are not marked as imported (that would be a column, and a schema
change). Each note's `createdAt` is the commit instant plus one millisecond per note in source order, because a thread
sorts `created_at DESC, id DESC` and ids are random: without distinct timestamps the imported order would be arbitrary.

**D2 — A note is plain text, and imported markup is converted, never stored or rendered.** One pure module
(`packages/interchange/src/note-text.ts`) holds every rule for both adapters and both emitters: decode the format's
entities, convert HTML to text with a single forward tokenizer (blocks become line breaks, `script`/`style`/`head` are
dropped with their content, other tags are removed, a `<` that does not start a tag is kept), remove control characters
(a NUL alone would roll the whole import back), unpaired surrogates, bidirectional overrides and isolates and zero-width
characters, normalise line breaks, and trim. HTML is **detected** in a foreign XER memo by a tag-shaped token rather than
assumed. A raw memo over 1,000,000 characters is refused before any of this runs, and every scan is linear. The
conversion is a fidelity transform, not a sanitiser: safety comes from never rendering markup (nothing in `apps/web/src`
uses `dangerouslySetInnerHTML`). RTF is not converted; such a note is left out and counted.

**D3 — Splitting at 5,000 characters is not a loss, and every change is reported in aggregate.** A longer note becomes
consecutive notes cut at a paragraph, then a line, then whitespace in the second half of the window, never inside a
surrogate pair. Findings are one per reason with a count (formatting removed, long notes split, notes not imported for
a stated reason), never one per note. The report gains `mapped.notes`, absent when zero, so a file without notes reports
exactly what it did before.

**D4 — The XER export uses one memo per activity under the exact label `SchedulePoint notes v1`, as escaped HTML, split
back on re-import; MSPDI joins notes without a split.** One `MEMOTYPE` row (`SPNOTES`) and one `TASKMEMO` row per task
with notes, `task_memo` last, bodies oldest first joined by `<hr>`, each body HTML-escaped with tabs and newlines made
explicit (the XER serialiser would otherwise collapse them). A body that literally contains `<hr>` was escaped to
`&lt;hr&gt;`, so it cannot split on the way back. The label is a convention, not proof of origin: it changes only how a
memo is cut, and every note passes the same text step. MSPDI writes one `<Notes>` per task, summaries included, joined
with a rule, so several notes come back as one and the report says so. Only text travels: **no author and no date**
leave SchedulePoint. Plan notes (no field in either format), notes on WBS summaries in XER (a summary exports as a
`PROJWBS` row) and notes past the ceiling are counted in the export report, not written. A plan without notes exports the
same bytes as before.

**D5 — Notes are written in phase 1 and removed by compensation; the audit row carries a count.** One batched
`createMany` after the dependencies, in the plan's own transaction, so an import that reports N notes created N.
`compensate` deletes the plan's notes **before** its activities (notes are RESTRICT into both). The
`interchange.imported` row gains `noteCount`; individual notes earn no event (plan content, ADR-0073). The ceiling is
`MAX_NOTES` = 20,000 per import and per export.

**D6 — No schema change and no engine change.** The notes table already holds everything needed. The schedule module
reads no note, and an API e2e imports the same file with and without its memos and asserts identical early and late
dates and critical flags per code.

**D7 — What is assumed about P6, and what would settle it.** This repository has never read a P6 file with a notebook
topic. Unobserved and allowed to stay so (spec FC-7): whether P6 opens the exported `MEMOTYPE` and `TASKMEMO` tables,
that `memo_type_id`/`memo_type` and the `TASKMEMO` columns are the real names, whether P6 allows several memos per task
under one topic (the reason D4 writes one), whether `task_memo` is always the last column, and where MS Project expects
`<Notes>` in the `<Task>` sequence. An owner-supplied P6 export with notebook topics would settle all of them. The
importer reads a topic name only from a `memo_type` column, and otherwise adds no prefix rather than guessing.

## Alternatives considered

- **Mark imported notes** (a "from P6" badge). Needs a provenance column, so a `database-architect` pass. Rejected as the
  default (Q1).
- **A null author.** Nobody could ever edit or delete the note. Rejected.
- **Store HTML and render it sanitised.** Notes are plain text, nothing renders HTML, and a sanitiser plus a rich
  renderer is new attack surface for formatting nobody asked for.
- **A dependency** (`html-to-text`, an RTF parser). The conversion needed is small and must be bounded.
- **Write notes after phase 2, best-effort.** The report would claim notes that might not exist. It stayed as the
  fallback if phase 1 measured over budget, and did not.
- **One `TASKMEMO` per note.** Depends on P6 accepting several memos per task under one topic, which is unverified.
- **A SchedulePoint `UDFVALUE` instead of a memo.** P6 users should see the remarks, and a user-defined field is the
  wrong P6 surface for prose.
- **An "Include notes" choice on export** (Q4's alternative). A new surface; the default is that every export carries
  notes and says how many.

## Consequences

- Remarks travel with the schedule in both directions, for both formats. The round trip of a SchedulePoint XER is exact
  per activity (FC-1); MSPDI joins several notes into one (FC-2) and says so.
- Anyone who can export can already read notes (`interchange:export` is a subset of `note:read`, pinned by a structural
  spec), so an export exposes nothing new inside the organisation. The file leaves it: internal remarks can reach a
  client, and the report states the count.
- Imported notes are editable only by the importer; Org Admin moderation stays out of scope, as in ADR-0046.
- Phase 1 is slower by about 3 s at the ceiling (below). Because the upload is capped at 16 MiB, the note text of one
  import is bounded to about 14 MB whatever `MAX_NOTES` says.
- The export note read is paged and bounded in rows and in bytes (`EXPORT_NOTES_MAX_BYTES`, the upload cap), reads only
  notes of live activities, and never reads the author. The plan export route is throttled (20 a minute).
- Known XER parser limits stay as they were and are pinned by unit cases: blank lines inside a P6 memo are lost before
  this reader sees them, a memo before another column is cut at the first continuation line, and a continuation line
  starting `%` rejects the file. A real file showing either becomes a `docs/TECH_DEBT.md` row.

## Measurements (ADR-0142)

Taken 2026-10-26 on the shared local container before any production write. Wall time of `persistGraph`, 5 runs, 5,000
activities, 9,999 relationships, 200 resources and 5,000 assignments, through the real `POST …/interchange/commit`:

| Notes                     | File    | p50   | max   |
| ------------------------- | ------- | ----- | ----- |
| none                      | 0.6 MB  | 2.6 s | 2.9 s |
| 20,000 notes of 650 chars | 14.1 MB | 5.6 s | 5.9 s |

The whole request (parse, phase 1, recalculation) was p50 7.7 s, max 8.1 s. The first harness, a bare Prisma client
against a 5 s limit, read 3.9 s p50 for 20,000 notes of 1,000 characters and stopped the work; the real limit is 15 s,
so one atomic transaction and `MAX_NOTES` = 20,000 stand. A 4,000-note API e2e keeps the batched insert above Prisma's
parameter-chunk size exercised in CI.

## Review ledger

Reviews were run by the orchestrator over each milestone's diff. None found a blocker.

- **M1 security:** no blockers. Folded: bidirectional and zero-width characters are removed (and arrive-as-numeric
  references are covered); `splitNoteBody` refuses a window under 2; the topic label is documented as a convention.
- **M1 backend-performance and test-engineer:** go. Folded: the chunking note, the 4,000-note e2e, a dry-run-writes-no-
  notes assertion, and the transaction time in the commit log.
- **M2 security:** no blockers. Folded: the export note read is paged and byte-bounded; notes on soft-deleted activities
  are excluded by the activity in the query, and the left-out count draws on the same population; the invisible-character
  strip applies on export, with a report line; the plan export route is throttled with a 429 in OpenAPI; a structural
  spec pins `interchange:export` ⊆ `note:read`.

Each load-bearing M2 piece was reverted once to confirm a test goes red:

| Reverted                                            | Went red                                                           |
| --------------------------------------------------- | ------------------------------------------------------------------ |
| `<` no longer escaped in the XER memo               | `note-text.spec.ts` (exact escape of every markup character)       |
| bodies joined with nothing instead of `<hr>`        | `note-text.spec.ts`, `export-notes.spec.ts` (the exact round trip) |
| the `<hr>` split removed on re-import               | the same two specs                                                 |
| the soft-delete filter dropped from the export read | `note.repository.spec.ts` and the ADR-0172 structural gate         |
| the author added to the export read's `select`      | `note.repository.spec.ts` (the exact `select`)                     |
| notes not deleted before activities in `compensate` | the FC-4 API e2e, with `23503` on `notes_activity_id_fkey`         |

The first run of the escaping mutant stayed **green**: the round-trip fixtures survived an unescaped `<` because a
lone `<` is kept literally on the way back, and `>` was still escaped. The exact-string escape test was added because
of it, which is the case for reverting each piece rather than trusting a round trip.

## References

- Spec and plan: [`docs/specs/interchange-notes/`](../specs/interchange-notes/)
- ADR-0046 (notes), ADR-0050 (interchange and its mapping contract), ADR-0156, ADR-0162, ADR-0073, ADR-0172, ADR-0142
- `docs/API.md`, "Schedule interchange"
