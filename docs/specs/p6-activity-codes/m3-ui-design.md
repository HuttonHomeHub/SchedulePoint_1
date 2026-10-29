# M3 UI design: show and edit codes

- **Spec:** [`./spec.md`](./spec.md) §0, §2, §4.8 · **Plan:** [`./plan.md`](./plan.md) M3 (M3-T1..T3) ·
  **Built so far:** [`./m2-record.md`](./m2-record.md) §9 · **Schema:** [`./database-design.md`](./database-design.md) §15 D7, D9 ·
  **Debt:** `docs/TECH_DEBT.md` #562
- **Status:** Draft. This is a design for M3, waiting for approval. It is not a spec header (the
  `check:spec-status` gate reads only `spec.md`).
- **Author:** ui-architect (Claude Code), 2026-10-29, for James Ewbank (product owner)
- **Owner decisions taken as given (not reopened):** spec Q1–Q11; the product word is **Codes**; code
  columns are off by default; Gantt code cells are read-only; a paste within a plan keeps codes and a
  paste across plans drops and counts them; no feature flag; **a type's values load on demand**
  (2026-10-29).

Every `file:line` below was read on the working tree on 2026-10-29. A claim marked **(verified)** was
checked against the code, not against the spec or plan. CLAUDE.md §19.11 applies: the spec was written
before the API existed, and §1 below lists the places where the spec or plan no longer matches the code.

---

## 1. What the code says that the spec and plan do not

These findings change the design. Each one is a correction of a document, not something the owner
needs to decide.

| #   | The spec or plan says                                                                    | The code says (verified)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                | What this design does                                                                                                                                                                                                                                       |
| --- | ---------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| F1  | Editor Codes group "saved with the definition scope" (spec §4.8)                         | ADR-0060 §3 (`docs/adr/0060-…:104-125`): one Save per **write scope**, and a scope is decided by its endpoint. Two endpoints that both bump `activities.version` behind one button are "a two-phase write whose second call needs the first's returned version" and the ADR rejects exactly that. The codes write is `PATCH …/activities/codes` (`plan-activities.controller.ts:192-229`). The definition write is `PATCH …/activities/:id`.                                                                                                                            | Codes are **their own write scope** on the General tab, with their own Save ("Save codes"), as Progress carries three. The history item stays under the `DEFINITION` history scope (design D7). These are two different things that share the word "scope". |
| F2  | "Activities ▸ **Columns** ▸ tick Trade" (spec journey 3, plan M3 entry point)            | The Activities table has **no column chooser**. Its columns are fixed (`ActivitiesTable.tsx:716-979`). The only column chooser is the Gantt's, in `View ▾ ▸ Columns` (`tsld-toolbar-items.tsx:186-196`, `:2429-2432`).                                                                                                                                                                                                                                                                                                                                                  | The table gets a **Columns** menu button in the Activities panel header that lists the code types only (§5.2). It is a `Menu` with `menuitemcheckbox` items, not a new primitive.                                                                           |
| F3  | Undo checks a row's codes before it writes (ADR-0176)                                    | A replay reads ≤ 5 rows through `GET …/activities/:id` (`use-plan-undo-redo.ts:237-252`, `SINGLE_READ_LIMIT = 5` at `replay.ts:65`). That route **omits `codes`** (`activities.service.ts:426-438` calls `withDayFactor`, not `decorateWithCodes` at `:411-424`). Above 5 rows the replay reads the list, which **does** carry them. So the same check would see `codes` present or absent depending on how many rows it touched.                                                                                                                                       | T0 adds `codes` to the single-activity GET (§3.4). Without it no codes undo can check anything.                                                                                                                                                             |
| F4  | Undo "set aside a since-deleted value" (plan M3-T3)                                      | A deleted value is refused with **422** `CODE_VALUE_DELETED` (`m2-record.md:203-205`). `writeOrSetAside` maps only 404 and 409 (`replay.ts:198-224`), so a 422 is **thrown**. That is a failed undo, not a set-aside step.                                                                                                                                                                                                                                                                                                                                              | The codes undo command maps `CODE_VALUE_DELETED` and `CODE_VALUE_WRONG_TYPE` to a new `not-applicable` reason (§8.2).                                                                                                                                       |
| F5  | "across plans drops and counts" codes on paste (design D9)                               | A cross-plan paste is **refused before any write**: `if (contents.planId !== planId) … announce('That copy came from a different plan.')` (`use-plan-workspace-model.ts:2949-2955`; `clipboard.ts:23-26`). The clipboard also empties when the plan changes (`:503-506`).                                                                                                                                                                                                                                                                                               | Nothing to build. The rule stands, but nothing can trigger it today. The clone census records that (§8.4). Whoever lifts that refusal owns the drop-and-count. No code is written for it now (CLAUDE.md §5: no dead code).                                  |
| F6  | The history placeholder "Code changed" (`format-history-item.ts:339-340`)                | `FIELD_LABELS.code` is `'Code'` (`format-history-item.ts:57`), the activity ID. So today's placeholder tells the reader the activity's ID changed. That breaks spec §0 rule 1.                                                                                                                                                                                                                                                                                                                                                                                          | T3 names the type: "Area: Level 1 → Level 2" (§9). A test makes sure no `code:` item's line starts with `Code `.                                                                                                                                            |
| F7  | The journey is "the existing `activity-editor` suite on the seeded coded plan" (plan M3) | That suite seeds nothing. It signs up its own organisation (`playwright.activity-editor.config.ts:19-20`). It turns on seven `VITE_` flags (`:70-81`), and its docblock describes a "legacy stacked plan-detail page" host (`:13-17`). `e2e-swimlanes` already seeds a catalogue family through `schedulepoint-seed` (`e2e-swimlanes/support.ts:134-163`). It enforces the pen, turns on no flags, and runs at 1646 px with cases for the 1024 × 600 floor (`playwright.swimlanes.config.ts:40-42`, `:59-66`). M4's journey is already planned there, on the same plan. | The M3 journey is a new spec file in **`e2e-swimlanes`** (§12). No new Playwright config and no new CI step, so no ADR-0105 trigger.                                                                                                                        |
| F8  | "Set Area…" on the selection bar (plan M3 entry point)                                   | Two things are called a selection bar. One is the table's bulk bar, shown when rows are ticked (`SwimlaneBulkAssignBar.tsx`). The other is the canvas selection bar (`features/plan-actions/selection-actions.tsx`). ADR-0206 B10 puts Move to swimlane… on both.                                                                                                                                                                                                                                                                                                       | M3 builds **the table's bulk bar** only. The canvas bar is owner question 2.                                                                                                                                                                                |

---

## 2. The problem, restated

At M2 the API went live with no client (`m2-record.md` §9). M3 makes codes visible and editable in the
web client without loading a large plan's code values all at once. There are four places to build:

1. **Codes…**: manage types and values (add, rename, reorder, delete, restore).
2. **Columns**: one column per type, off by default, in the Activities table (editable through the
   other three places) and in the Gantt (read-only).
3. **Editor ▸ General ▸ Codes**: one picker per type for the open activity.
4. **Set <type>…**: one value (or none) for many ticked rows, as one write and one undo step.

Each of them must also work with undo (ADR-0048/0176), activity history (ADR-0174) and paste
(design D9). It must hold at 1024 × 600 (ADR-0179) and with a coarse pointer (ADR-0118/0183).

### Why the values must load on demand (verified)

- `GET …/code-types` nests **every live value of every type in the page** in one query
  (`code-types.service.ts:86-96`). Its page is the whole cap of 100 types (`code-type-list-query.dto.ts:11-19`).
  At 100 × 1,000 that is 100,000 rows, measured at 2.3 s p50 and 2.6 s p95 (`m2-record.md:254-255`).
- `?include=deleted` reads every deleted value of those types with no bound (`code-value.repository.ts:107-117`;
  #562 bullet 2).
- The web loads **every activity** of the plan (`use-activities.ts:224-234`), so every activity's
  `codes` ids are already in memory. What a screen lacks is the **names** behind those ids.
- The rate limit is 100 requests per minute **per route handler** (`env.validation.ts:292-293`; the
  per-handler budget is the constraint the paste composite already designs around,
  `use-clone-carriage.ts:83-85`). So "one request per type" must never be fired for every type at
  once on a screen open. A 100-type plan would spend the whole minute's budget.

---

## 3. T0: the server read contract

All routes are under `/api/v1/organizations/:orgSlug/plans/:planId`. They use the standard
`{ data, meta }` envelope and cursor paging as `docs/API.md:2009-2010` states it (`?limit&cursor`,
`meta.nextCursor`, `meta.hasMore`). Everything is **additive** (an `api` minor). Nothing that already
answers changes shape.

### 3.1 `GET code-types` gains `?values=none` and `valueCount`

| Param     | Values                     | Meaning                                                                                                                                                                                                                                                                  |
| --------- | -------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `values`  | `none` (absent = as today) | With `none`, each type is returned **without** `values` and the value query is not run. Absent keeps today's nesting, so the seeder, the playbook rows (`TEST_PLAYBOOK.md:112`) and every e2e that reads values from this route answer exactly as before.                |
| `include` | `deleted` (unchanged)      | Deleted types are added. With `values=none` the answer is **bounded by the types** (live ≤ 100, deleted paged): the unbounded deleted-values read of #562 bullet 2 no longer runs. A type's deleted values come from §3.2. `code:restore` is still required (unchanged). |
| `limit`   | 1–100, default 100         | Unchanged (the house rule: the default page is the cap, as for swimlanes, `docs/API.md:698`).                                                                                                                                                                            |
| `cursor`  | a type id                  | **Validated as a UUID (422)**. This folds #562 bullet 8 for this route.                                                                                                                                                                                                  |

Each listed type gains **`valueCount`**, its number of **live** values. It comes from one `groupBy` over
the page's type ids, and it is sent with or without `values`. The dialog's left pane needs it ("Area ·
4 values"), and so does the delete confirmation. `CodeTypeSummary` in `@repo/types` gains
`valueCount?: number`. It is optional because single-row writes do not send it.

**Why not change the default** to "no values": the route is dark but has callers (the seeder,
`code-types.e2e-spec`, playbook row 112). An opt-in parameter costs nothing. The web always sends
`values=none`. `docs/API.md` "Codes" says the default is kept for compatibility and is not what a
screen should use.

### 3.2 New: `GET code-types/:codeTypeId/values`

One type's values, cursor-paged.

| Param     | Values                 | Meaning                                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| --------- | ---------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `limit`   | 1–1,000, default 1,000 | The default is **the per-type cap** (`CODE_VALUE_LIMIT`, `codes.constants.ts:7`), the same rule `code-types` follows for its cap. So a live list is always one page. It has to be: **a reorder must name every live value with its version** (`reorder-codes.dto.ts:43-52`), so the dialog needs all of them anyway. Overrides `PaginationQueryDto`'s `@Max(100)` (`pagination-query.dto.ts:18-24`) in its own DTO, as `CodeTypeListQueryDto` overrides the default. |
| `cursor`  | a value id (UUID, 422) | Keyset after `position, id`, the same `cursor: { id }, skip: 1` shape as the type list (`code-type.repository.ts:62-74`).                                                                                                                                                                                                                                                                                                                                            |
| `include` | `deleted`              | Deleted values are added, each with `deletedAt`. `code:restore` is required (403 otherwise), the same rule as the list (`code-types.service.ts:69-71`). Ordered `position, id` like live rows. **Bounded per type and per page.** This is the remaining half of #562 bullet 2.                                                                                                                                                                                       |

- **Order:** `ORDER BY position, id`, the order the reorder writes.
- **Answer:** `{ data: CodeValueResponseDto[], meta: { nextCursor, hasMore } }`, the existing value DTO (`code-response.dto.ts:7-53`).
- **Errors:** another plan's or organisation's type, a deleted type, or an unknown type is **404**,
  never told apart. A deleted type's values come back through the type's own restore
  (`code-types.service.ts:280-374`), so there is no "values of a deleted type" read.
- **Permission:** `code:read`. Audit: none (reads are not audited, ADR-0073).
- **ADR-0172:** the live read states `deletedAt: null`. The `include=deleted` read carries a
  `soft-delete: any-state — restore picker` comment, as `findManyAllByTypes` does
  (`code-value.repository.ts:102-117`). `soft-delete-filter.structural.spec.ts` gains the declaration.

### 3.3 New: `GET code-values?id=…`, resolve names by id

| Param | Values                                                     | Meaning                                                                                                                                                       |
| ----- | ---------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `id`  | 1–100 UUIDs, **repeated** (`?id=a&id=b`, not comma-joined) | `docs/API.md:569-572` sets the repeated-parameter convention. 100 = `CODE_TYPE_LIMIT`, because one activity carries at most one value per type. 422 above it. |

- **Answer:** `{ data: ResolvedCodeValueDto[] }`, where `ResolvedCodeValueDto` = `CodeValueResponseDto` + `codeTypeName` +
  `codeTypeDeletedAt`. It is **not paged**: the input bounds it, and `docs/API.md:461` already records
  that a cursor on a bounded answer "would be a contract with no subject". Ids that are unknown, foreign
  or already purged are **absent**. The caller maps by id and treats absent as unknown.
- **Deleted values and deleted types are included**, under `code:read`. Two readers need them: history
  lines, which name values deleted since, and the editor, whose activity may carry a value that is
  being restored. The reasoning, for **security-reviewer**: the caller already holds the id (from its
  own activity's `codes` or from history), and the value was readable to it while live. ADR-0174's
  history already shows a deleted resource's name to every reader. This is **not** the restore picker:
  it cannot list what is deleted. It can only name ids the caller already has. `include=deleted` on §3.1
  and §3.2 stays behind `code:restore`.
- **Why it exists.** The editor's pickers need a label for the **current** value of every type before
  any picker is opened (§7). Without this route that is one values request per type on every editor
  opening, which at 100 types is the whole minute's budget (§2). With it, an opening costs **one**
  request.

### 3.4 `codes` on the single-activity GET

`GET …/activities/:activityId` returns `codes` under the same rule as the list: absent when the plan
has no live code type, `[]` for an activity with none, and otherwise one entry per type with a live
value. The change is `get` calling `decorateWithCodes([activity])` instead of `withDayFactor(activity)`
(`activities.service.ts:426-438`). That adds one statement.

**Other** single-activity write responses still omit `codes`. `docs/API.md:814-820` is updated to say
"the list, the single-activity GET and the codes write carry `codes`". The web's rule is unchanged:
it **never** puts a write response into the list cache. That is true today
(`grep setQueryData … activityKeys` finds none outside tests), and §6 keeps it so.

### 3.5 The #562 companions

| #562 bullet                                            | Folded?                         | Why                                                                                                                                                                                                                                                                                                                      |
| ------------------------------------------------------ | ------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| 1 values on demand                                     | **Yes**                         | §3.1, §3.2                                                                                                                                                                                                                                                                                                               |
| 2 `?include=deleted` unbounded                         | **Yes**                         | §3.1 with `values=none`, §3.2 per type                                                                                                                                                                                                                                                                                   |
| 3 the write answers with every code                    | No                              | Harmless to the screen: the web refetches and never merges a write response into the cache (§6). Trimming it saves bytes, which is not a problem anyone has measured.                                                                                                                                                    |
| 4 `bumpVersions` re-locks                              | No                              | Not screen-facing. It stays with the M2-T5 review row.                                                                                                                                                                                                                                                                   |
| 6 `ActivityWithCodesResponseDto` with required `codes` | **No, and should not be built** | `codes` is _meant_ to be absent for a plan with no types (SC-2). A required field would put `codes: []` on every such plan and break SC-2. "Present only if the plan has types" cannot be expressed as a static type. The optional field already says exactly that, and `@repo/types` documents it (`index.ts:689-694`). |
| 8 malformed `cursor`                                   | **Yes, for the codes routes**   | §3.1, §3.2 (`@IsUUID()`). The inherited general case (#20) stays open.                                                                                                                                                                                                                                                   |

### 3.6 Shared text limits

`CODE_NAME_MAX`, `CODE_SHORT_CODE_MAX`, `CODE_DESCRIPTION_MAX`, `CODE_TYPE_LIMIT` and `CODE_VALUE_LIMIT`
move from `codes.constants.ts:6-16` into `@repo/types` (spec §2 Validation rules: "Shared client ↔
server via `@repo/types`"). The API re-exports them. The web's name-problem helpers read the same
numbers. This differs from swimlanes, whose web code keeps its own `SWIMLANE_NAME_MAX`
(`swimlane-names.ts:2`). The difference is deliberate: the short-code and description limits are
provisional until M0 (Q5), so they must be changeable in one place.

---

## 4. Module structure

```text
apps/web/src/features/codes/                       NEW feature (spec §4.8 named it)
├── index.ts                                       public surface: components + hooks below
├── api/
│   ├── use-code-types.ts                          values=none list (+ include=deleted variant)
│   ├── use-code-values.ts                         one type's values, all pages (+ deleted variant)
│   ├── use-code-value-names.ts                    resolve-by-id (§3.3), chunked at 100
│   ├── use-code-mutations.ts                      type/value create, rename/edit, reorder, delete, restore
│   └── use-write-activity-codes.ts                PATCH …/activities/codes
├── model/
│   ├── code-names.ts                              codeValueName(), codeValueOptionLabel() — one naming rule
│   ├── code-text.ts                               typeNameProblem(), valueProblem() (limits from @repo/types)
│   ├── code-errors.ts                             reason → sentence (the swimlane-errors.ts shape)
│   ├── codes-gating.ts                            pure: role + pen → { writable, reason, canRestore, roleDenied }
│   ├── use-codes-actions.ts                       write + remember the undo step (use-swimlane-actions shape)
│   ├── code-columns.ts                            CodeColumn[] for the table and the Gantt; URL list parse/serialise
│   └── code-assignment-plan.ts                    pure: selection × target → rows to send, willChange count
└── components/
    ├── CodesDialog.tsx                            the two-pane dialog (§5.1)
    ├── CodeTypePane.tsx                           right pane: the type's header actions + values table + add form
    ├── CodeValueEditDialog.tsx / CodeTypeRenameDialog.tsx / CodeDeleteDialog.tsx   stacked (swimlane precedent)
    ├── DeletedCodesDisclosure.tsx                 restore lists (types in the rail, values in the pane)
    ├── CodeColumnsMenu.tsx                        the table's Columns menu (§5.2)
    ├── ActivityCodesSection.tsx                   the editor's Codes scope, rendered through a slot (§7)
    ├── CodeValuePicker.tsx                        Combobox over one type's values, loads on first open
    └── CodeBulkAssignBar.tsx                      Set <type>… for ticked rows (§7.3)

apps/web/src/features/undo-redo/code-commands.ts   NEW: type/value steps + activityCodesCommand (§8)
apps/web/src/lib/query/hierarchy-keys.ts            + codeKeys (beside swimlaneKeys, :369-373)
apps/web/src/components/layout/workspace/          host wiring only: panel header, editor slot, Gantt ctx
```

**The dependency direction is one way, and the slot pattern is what keeps it that way.** Today the
`features/activities` editor imports no other feature for its cross-feature panels. The host composes
them (`swimlaneSlot`, `historySlot`: `activity-crud-dialogs.tsx:182-259`). `features/codes` reads the
activity keys from `lib/query` and never imports `features/activities`, and `features/activities` never
imports `features/codes`. The table and the Gantt receive plain `CodeColumn[]` props from the host, as
the table receives `swimlanes` today (`ActivitiesTable.tsx:906-927`). **`features/tsld` gains no
import.** The Gantt's `View ▾ ▸ Columns` entries reach it as plain `ctx.ganttColumns` data
(`tsld-toolbar-items.tsx:2342`), so `docs/TECH_DEBT.md` #548 does not grow.

**Primitive count.** No new primitive. One shared component is extracted: the dialog row's icon
button (`RowButton`, private at `SwimlaneManageDialog.tsx:341-387`) moves to
`components/ui/row-action-button.tsx`. Codes would be its second copy. The rule it carries
(`aria-disabled` with a per-row reason, never native `disabled`, ADR-0204) must not fork, so it is
moved now rather than copied. That is a component-reviewer item.

---

## 5. The screens

### 5.1 Codes… (M3-T1)

**Entry point:** the Activities panel header gets a **Codes…** button beside **Columns**, before
**New activity** (`activity-bottom-panel.tsx:310-327`; the header already wraps, `:286`). It is shown
to every reader who has `code:read`, which is every member. A Viewer opens it to read.

**Shape:** `Dialog size="xl"` (896 px, the two-pane preset, `dialog.tsx:18-25`), titled "Codes", with
the description "P6 activity codes. Changes apply at once. Each is one step you can undo." (spec Q9
puts "P6 activity codes" in hints).

| Left pane (rail, ~208 px)                                                                                                                                                                                                                                                                                                                                                                                                     | Right pane (the type)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `Tabs orientation="vertical"` labelled "Code types". One tab per live type, labelled with its name. The value count sits in the panel heading, not in a `count` marker, because `count` means validation errors (`tabs.tsx:47-53`). Below the list: an **Add code type** form (`TextField` + submit). For `code:restore` holders, a **Deleted code types** `Disclosure` that fetches §3.1 `include=deleted` only when opened. | The tabpanel. Its heading is "Area · 4 values", followed by the type's actions: **Rename…**, **Move up**, **Move down**, **Delete…**. Then the values in a `DataTable` (Short code · Description · Activities · row actions **Edit…**, **Move up**, **Move down**, **Delete…** as `RowActionButton`s named for the row, ADR-0117). It is windowed above 100 rows (ADR-0165, `windowed`). Then an **Add value** form (short code, optional description). Last, a **Deleted values** `Disclosure` (§3.2 `include=deleted`), for restore holders only. |

- **Why `Tabs` rather than a list of buttons.** It gives one tab stop and Arrow/Home/End, against up to
  100 tab stops. The keyboard contract is the primitive's, unchanged. **This is a second consumer of
  the vertical rail, and ADR-0061 §3 says "applies to the activity editor alone"**
  (`docs/adr/0061-…:86-89`). That sentence needs an amendment note in T1's PR (or in the epic ADR at
  M7). The note says a rail is right wherever the sections are a set the reader picks from, and the
  editor was only the first such set.
- **Automatic activation** (`tabs.tsx:10-12`). Arrowing selects a type, and that type's values query
  starts. The docblock's reason ("every panel's data is already in memory") is not true here. It stays
  acceptable because a type's values are one request of at most 1,000 rows (§3.2), cached for 30 s
  (`query-client.ts:24`), and the pane shows its settled shape while loading (§10). If the T1
  measurement shows arrowing through a 100-type rail trips the rate limit, the remedy is a manual-
  activation option on `Tabs`. That would be an ADR-0111 change, and it is **not** built now.
- **Activities count** per value and per type comes from the activity list already in memory. It needs
  no request, and the delete sentence uses it: "Delete L1? 3 activities carry it. They will read as
  having no Area until you restore it." The type sentence is "Delete Area and its 4 values? 6 activities
  carry an Area value."
- **Reorder.** **Move up / Move down** buttons, as in the swimlane dialog (`SwimlaneManageDialog.tsx:155-166`,
  `:254-277`). They serve pointer and keyboard alike, so **there is no drag** and no single-pointer twin
  is owed (ADR-0188). A value reorder sends every live value with its current version, which is why
  §3.2 always loads the whole live list. The end-of-list states are shaded with their own sentence
  ("L1 is already first.") through `RowActionButton`'s `endReason`.
- **Flat** even if parents are ever stored (Q11). There is no `parent_id` today (`m2-record.md:23`).

### 5.2 Columns (M3-T2)

**Activities table.** A **Columns** `Menu` button in the panel header, with one `menuitemcheckbox`
per live type in type order, labelled by the type's name. Checking a type adds a column headed with
that name after the WBS column. The column is hidden below `lg` like every other definition-detail
column (`ActivitiesTable.tsx:933-951`). If the plan has no types, the button is shaded (`aria-disabled`,
ADR-0204) and described by "This plan has no codes yet. Add them with Codes…". At the cap the
unchecked items are shaded, each with its reason (ADR-0082: still focusable): "Up to 10 code columns
at a time."

**Gantt.** `View ▾ ▸ Columns` (`GanttColumnsGroup`, `tsld-toolbar-items.tsx:2429-2432`) gains a
**Codes** sub-list under the standard columns, with the same items, cap and reasons. Columns are
`sortable: false` in v1. They are **not printed**: the printed programme carries the standard columns,
the same rule as the swimlane column (`grid-columns.ts:39-44`). That is owner question 1.

**Cell text.** A cell shows `codeValueName(value)`: the description, or the short code if there is no
description. This is **the owner's own swimlane-name rule** (spec Answered, line 27), so a value reads
the same in a cell, a history line and, from M4, a swimlane. An activity with no value reads "—". While
the type's values load, the cell reads "Loading…" in muted italic, the Calendar column's precedent
(`ActivitiesTable.tsx:889-897`). If the load failed it reads "Unavailable". No cell ever falls back to
an id.

**How names are resolved for a column.** When a code column is **shown**, the host loads **that
type's** values (§3.2, one request) and builds an `id → name` map. Nothing loads for hidden types. The
alternative was resolving only the ids on screen. It was rejected because the plan's every activity is
already in memory (`use-activities.ts:224-234`), so the ids a column can show are all of that type's
values in use, which is at most the type's whole list. Resolving by id would cost **more** requests
for the same names.

**The cap is 10 shown code columns per grid.** There are three reasons:

1. A Gantt grid of ten 96 px code columns is already wider than the 1024 px floor.
2. Ten type loads is a bounded request cost (§2).
3. Ten 36-character ids keep the URL short. The precedent is `MAX_COLLAPSED_IN_URL = 40`
   (`gantt-view-state.ts:92-93`).

The cap is a default, not an owner question.

**Where the choice is kept: the URL**, as the Gantt's other view memory is (`gantt-view-state.ts:11-20`).
The Gantt uses `gcodes` and the table uses `acodes`. Each is a comma-separated list of **shown** type
ids, written in type order. **This is a shown-list where the Gantt's hidden columns use a hidden-list**
(`:141-148`), and the reason is the owner's decision: "off by default" means a type added later must
**not** appear for a planner holding an old URL. When parsing, ids of types that no longer exist are
dropped and the cap is enforced; a value that cannot be read gives the default. The two parameters go
through the plan route's search validation (ADR-0123). The table and the Gantt keep separate choices,
because each grid has its own chooser and both can be on screen at once (the panel sits under the
Gantt).

**Widths (ADR-0173).** All code columns share **one** remembered width: key `codes` in
`schedulepoint:gantt-column-widths`. Per-type keys would grow the device record without limit, and
those keys would be ids from plans the device may never open again. The trade: widening Area widens
Trade as well. If planners ask for it, per-type widths can be added later without losing the stored
record.

**Render cost.** With no code column shown, the table's `columns` memo
(`ActivitiesTable.tsx:709-716`) must not change identity. `ActivitiesTable.render-count.test.tsx` stays
**unchanged and green**, which is the plan's M3-T2 criterion. The host memoises `CodeColumn[]` on
`(shown ids, the name maps)`, so a values load rebuilds the columns once and no more.

---

## 6. Data fetching, cache keys, invalidation

### 6.1 Keys (`lib/query/hierarchy-keys.ts`, beside `swimlaneKeys`)

| Key                                                                                             | Holds                               | Enabled when                                                                                                                |
| ----------------------------------------------------------------------------------------------- | ----------------------------------- | --------------------------------------------------------------------------------------------------------------------------- |
| `codeKeys.types(org, plan)` → `['codes', org, 'plan', plan, 'types']`                           | §3.1 `values=none`, all pages       | a consumer mounts (dialog, Columns menu, editor section, bulk bar, history panel). It is cheap: at most 100 rows.           |
| `codeKeys.typesDeleted(org, plan)` → `[…, 'types', 'deleted']`                                  | §3.1 `values=none&include=deleted`  | the Deleted code types disclosure is open **and** the reader can restore                                                    |
| `codeKeys.values(org, plan, typeId)` → `['codes', org, 'plan', plan, 'type', typeId, 'values']` | §3.2 live, all pages (normally one) | the dialog's active type; a shown column; a picker after its first open (§7.1); the bulk value picker once a type is chosen |
| `codeKeys.valuesDeleted(org, plan, typeId)` → `[…, 'values', 'deleted']`                        | §3.2 `include=deleted`              | the Deleted values disclosure is open                                                                                       |
| `codeKeys.names(org, plan, ids)` → `['codes', org, 'plan', plan, 'names', ...sortedIds]`        | §3.3, chunked at 100                | the editor's Codes section (that activity's ids); the history panel (ids on loaded pages)                                   |

All of them use the default `staleTime` of 30 s (`query-client.ts:24`) and `retry: 1`, the swimlane
list's choice (`use-swimlanes.ts:10-12`). With refetch-on-focus, a return to the tab costs at most
`1 + shown columns` requests.

### 6.2 What each write invalidates

| Write                        | Invalidate                                                                                                                                                                                                                            | Not                                                                                                                                        |
| ---------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------ |
| type create, rename, reorder | `types`                                                                                                                                                                                                                               | activities: no `codes` entry changes, and headers read type names from `types`                                                             |
| type delete, type restore    | `types`, `typesDeleted`, that type's `values` and `valuesDeleted`, `names` prefix, **`activityKeys.listByPlan`** and the `activityKeys.detail` prefix: a deleted type's entries leave every activity's `codes` with no activity write | activity history (no history row is written)                                                                                               |
| value create                 | its `values`, `types` (`valueCount`)                                                                                                                                                                                                  | activities                                                                                                                                 |
| value edit                   | its `values`, `names` prefix                                                                                                                                                                                                          | activities: `codes` holds ids, so a rename needs no 2,000-row refetch (the swimlane rename's reasoning, `use-swimlane-mutations.ts:12-15`) |
| value reorder                | its `values`                                                                                                                                                                                                                          | activities                                                                                                                                 |
| value delete, value restore  | its `values`, `valuesDeleted`, `types`, `names` prefix, **`activityKeys.listByPlan`** and the detail prefix (the activities read as "no value", or return)                                                                            |                                                                                                                                            |
| `PATCH …/activities/codes`   | `activityKeys.listByPlan`, the touched ids' `activityKeys.detail`, the touched ids' `activityHistoryKeys.byActivity`                                                                                                                  | baseline variance and schedule keys: not a schedule input (SC-3, `NOT_INPUT`)                                                              |

**Only the list, the detail GET (after T0) and the codes write carry `codes`.** The house rule is
already invalidate-and-refetch for every activity write. `useBatchPositions`, for example, refetches
and never merges (`use-activities.ts:406-420`). Keep it, and pin it: a structural test in
`features/codes` fails on any `setQueryData` against `activityKeys.listByPlan` outside tests. Without
it, a future optimistic update built from a response that omits `codes` would blank every activity's
codes and nothing would say so.

`useWriteActivityCodes`' `onSettled` **returns** the awaited invalidation (the `invalidateActivity`
shape, `use-activities.ts:35-49`). So `mutateAsync` resolves only after the list has refetched, and the
editor's other scopes then hold the fresh `version` the codes write bumped.

---

## 7. Editor, pickers, bulk (M3-T3)

### 7.1 The value picker: `CodeValuePicker`

It is the **`Combobox`** primitive, not `SelectField`. A type can hold 1,000 values, and the Combobox
was built for this case: type-ahead filtering, a current value that always renders through
`selectedLabel`, a `loading` row, a "None" row through `emptyOption`, and `readOnly` for a shaded field
(`combobox.tsx:7-46`, `:88-121`). `SelectField` stays where the list is short (the bulk bar's type
chooser).

- **It loads on first open, with no change to the primitive.** The Combobox "never fetches: the
  consumer owns `query`/`onQueryChange`" (`combobox.tsx:17-21`). Opening the list calls
  `onQueryChange('')` (`:381-386`). The picker turns on its `codeKeys.values` query the first time
  `onQueryChange` fires, and then filters on the client (at most 1,000 rows). **So the Combobox's
  keyboard contract is not touched**, and ADR-0111 has no change to review in it, only a new consumer.
- `selectedLabel` comes from §3.3 (`names`), so the current value shows before anything is opened.
- Option label `codeValueOptionLabel(v)` = `"L1 — Level 1"`, or `"L1"` alone. The short code leads
  because it is what P6 users type.

### 7.2 Editor ▸ General ▸ Codes: its own write scope (F1)

- **Rendered through a new `codesSlot`** on `ActivityEditorDialog`, composed by the host beside
  `swimlaneSlot` and `historySlot` (`activity-crud-dialogs.tsx:182-259`). It is placed last on General
  under `FormSection title="Codes"` (ADR-0061 layout primitives, ADR-0089 field group).
- One `CodeValuePicker` per live type in type order, labelled by the type's name, inside a `FieldGrid`.
- **A Save of its own** (`ScopeSaveBar`, labelled "Save codes"). It sends one `PATCH …/activities/codes`
  with the activity's `version` and **only the types the planner changed**. Codes are recorded as one
  undo step and one history entry. The General tab now has two Saves, which ADR-0060 §3 expects when a
  tab holds two scopes ("Honesty. Two buttons that save different things should not look like one
  button.").
- **Gating:** `ActivityWritePath` gains `codes`, set to **the same `definition` object**
  (`activity-editor-gating.ts:110-134`). The identity test is extended so that "this epic changes no
  permission" is checked rather than claimed.
  - A role that can never write (`roleDenied`) sees a **read-only summary**, a list of "Area: Level 1"
    lines (ADR-0083 D5).
  - A Planner without the pen sees shaded pickers (`readOnly`) and one pen sentence they all point to
    (ADR-0112, ADR-0204, ADR-0083 D4: one sentence node, many references).
- **Unsaved work** registers like any other scope (`ActivityEditor.registers-unsaved-work.test.tsx`).
  The General tab's `dot` marker counts it. The working state lives for one opening (ADR-0169).
- **WBS summaries** show and edit codes. A P6 file may carry codes on them (spec §2 edge cases), and the
  server accepts the write (`activity-codes.service.ts` has no summary refusal, grep verified).
- **When the plan has no types:** writers see "This plan has no codes yet. Add them with Codes… in the
  Activities panel." Readers see "This plan has no codes."

### 7.3 Set <type>…: `CodeBulkAssignBar`

- A **companion row** inside the Activities table's existing bulk container, the
  `SwimlaneBulkAssignBar` `companion` mode (`SwimlaneBulkAssignBar.tsx:43-61`). It shows whenever rows
  are ticked, and **shaded for a reader who cannot write**, because the ticked rows are that reader's
  only route to the reason (ADR-0063 §10.2, as that bar's docblock says, `:18-21`).
- It holds a **Code** `SelectField` (the types), a **Value** `CodeValuePicker` (with **None** to clear),
  and a Button whose label follows the chosen type: "Set code" until a type is chosen, then
  **"Set Area"**. A status line ties them together, in the `MoveToSwimlaneControl` shape
  (`MoveToSwimlaneControl.tsx:177-195`): "Sets Area to Level 1 on 5 activities. 2 already have it."
- **One write, one undo step.** Only the rows whose value would change are sent, counted by the pure
  `code-assignment-plan.ts`. Each row carries the `version` from the live list.
  - Above **2,000** changing rows the Button is shaded with "Set a code on up to 2,000 activities at a
    time." 2,000 is the route's `maxItems` (`docs/API.md:807-809`). The 512 KB body limit is not reached
    with one type per row.
  - A 2,000-row write measured 1.0–2.6 s (`m2-record.md:252`, `:260-267`). While it runs, the Button
    is `aria-busy` and reads "Setting…".
- Summaries have no tick box in the table (`ActivitiesTable.tsx:729-741`), so a bulk set never reaches
  one.
- **M4 note:** under an `ACTIVITY_CODE` source the same write must also carry lanes (spec §4.2). The
  control's planning goes through `code-assignment-plan.ts` so that M4 can add lanes in one place.

---

## 8. Undo (ADR-0048, ADR-0176)

### 8.1 `ReplayContext` gains two fresh reads (`replay.ts:71-90`)

- `readCodeTypes(): Promise<readonly CodeTypeSummary[]>` reads §3.1 `values=none`, fresh.
- `readCodeValues(typeId): Promise<readonly CodeValueSummary[] | undefined>` reads §3.2, fresh;
  `undefined` when the type is gone.

`test/fake-plan-server.ts` implements both.

### 8.2 Commands (`features/undo-redo/code-commands.ts`, on the `swimlane-commands.ts` shape)

| Command                                                  | Check (fresh read)                                                                                                     | Undo / redo                                                                                                                                                                    |
| -------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `codeTypeAddCommand`                                     | the type is there under the name it was left with                                                                      | delete (with current `version`) / **id-stable restore**, not a re-create, so later steps still address the same id (`swimlane-commands.ts:56-113`)                             |
| `codeTypeRenameCommand`, `codeValueEditCommand`          | the field still holds what the step left                                                                               | write the other name or field with the **current** version                                                                                                                     |
| `codeTypeReorderCommand`, `codeValueReorderCommand`      | the whole order is the order the step left (`sameOrder`, `swimlane-commands.ts:144-190`)                               | write the other order with current versions. A changed set gives `changed`                                                                                                     |
| `codeTypeDeleteCommand`, `codeValueDeleteCommand`        | for redo: the row is live under its name                                                                               | restore / delete. Restoring a value whose type was deleted meanwhile answers 409 `PARENT_DELETED`, which is already `parent-deleted` (`replay.ts:209`)                         |
| `activityCodesCommand` (the editor's Save, the bulk Set) | every named activity's `codes` **for the touched types** equals the step's after-state (needs T0's detail `codes`, F3) | one `PATCH …/activities/codes` with the before-state (`null` clears) and the current versions. `affectsSchedule: false` (codes are `NOT_INPUT`). Subjects are the activity ids |

**The set-aside the plan names (F4).** `activityCodesCommand` wraps its write so that a 422 whose
reason is `CODE_VALUE_DELETED` or `CODE_VALUE_WRONG_TYPE` becomes `not-applicable`, with a new reason
`'value-deleted'`. The strip reads: "Level 1 was deleted. Restore it in Codes… to set it again." That
is set-aside, not ADR-0201 D4's keep-the-stack throw. ADR-0201 D4 threw because a deleted activity
"is not listed in Recently deleted, so dropping the step would leave no way in the product to get that
work back". A deleted value **is** restorable from Codes… (§5.1), and the code can then be set again
by hand.

In practice the check usually catches this first. A deleted value reads as **absent** in `codes`
(`docs/API.md:814-820`), so the after-state no longer matches and the step answers `changed`. The 422
mapping covers the race between the check and the write.

**Coverage census.** Every new mutation hook gets a `COVERAGE` entry (`coverage.ts:61`, `:101-107`):
`recorded(...)` for all type, value and codes writes. There is no `excluded` case.

### 8.3 Labels

Labels use concrete names (the S1 convention, `commands.ts:2095`):

- `Add code type “Area”`, `Rename code type “Area”`, `Move code type “Area”`, `Delete code type “Area”`
- `Add value “L1” to Area`, `Edit value “L1”`, `Move value “L1”`, `Delete value “L1”`
- `Set Area on “Piling”`, `Set Area on 8 activities`, `Change codes on “Piling”` (an editor save that
  touched more than one type)

### 8.4 Paste within a plan keeps codes (design D9)

- **Where.** In `duplicateActivities` (`use-plan-workspace-model.ts:2710-2888`), between the create
  loop and the carriage. Today the loop creates a clone and then immediately carries its steps and
  assignments (`:2761-2785`).
- **Order matters, and the reason is the one `use-clone-carriage.ts:98-114` records.** A units-driven
  assignment create bumps the clone's version. A codes write sent **after** carriage would therefore
  409 on exactly the clones that have a resource rate, and roll the whole paste back.
- **The change:**
  1. Create every clone.
  2. Send **one** `PATCH …/activities/codes` for every clone whose source carries codes. The sources
     are the live rows from `resolveClipboard`, which carry `codes`. The clone set is at most 50
     (`clone-graph.ts:74`), so this is one request whatever the size.
  3. Carry steps and assignments, using the **versions the codes response returned**.
- The rollback is unchanged: everything stays inside the same `try`, and a failure deletes what was
  created.
- **The undo expectation** (`commands.ts:2105-2111`) adds `codes`, read from the codes response. A
  colleague's later code change on a clone then sets the paste's undo aside, as any other edit does.
- **Census.** `clone-projection.ts:145-152` changes `codes` from "withheld until M3-T3" to a reason that
  says what now happens: carried after create by the paste's own codes write within the plan. A
  cross-plan paste is refused before any write (`use-plan-workspace-model.ts:2949-2955`), so the
  drop-and-count rule has nothing to act on (F5). `activity-field-census.test.ts`'s comment block
  records the reclassification. Its count stays 68.

---

## 9. History lines (ADR-0174, design D7)

`HistoryFormatContext` (`format-history-item.ts:37-45`) gains `codes: { typeName(id): string |
undefined; valueName(id): string | undefined }`, which stays pure. `ActivityHistoryPanel` builds it
from `codeKeys.types` and from §3.3 `names` for the value ids on the pages it has loaded (deleted
values included).

| Item `code:<typeId>` `{ from, to }` | Line                               |
| ----------------------------------- | ---------------------------------- |
| `null → v`                          | `Area set to Level 1`              |
| `v → w`                             | `Area: Level 1 → Level 2`          |
| `v → null`                          | `Area cleared (was Level 1)`       |
| type unknown                        | `A code` in place of the type name |
| value unknown (purged)              | `a value that no longer exists`    |

Names use `codeValueName` (§5.2). A **deleted** type or value is still named, with no suffix: history
records what happened, and the name was right at the time. The sort order is unchanged: code items
sort after fields, by key (`format-history-item.ts:360-367`).

---

## 10. States (ADR-0202: the loading state is the settled shape, and says one sentence)

| Surface              | Loading                                                                          | Empty                                                                                                                   | Error                                                                                                                                         |
| -------------------- | -------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------- |
| Codes… rail          | three skeleton tab rows at the settled height; one sentence "Loading codes…"     | "This plan has no codes yet. Add a code type, such as Area or Trade." The Add form is focused when the reader can write | `QueryErrorState` inside the dialog body with Retry; the Add form is not shown                                                                |
| Codes… pane          | the table's header and five skeleton rows; "Loading Area’s values…"              | "Area has no values yet. Add one below."                                                                                | the pane's own `QueryErrorState` with Retry; the rail stays usable                                                                            |
| Deleted disclosures  | one skeleton row and a sentence                                                  | "Nothing deleted."                                                                                                      | an inline error with Retry                                                                                                                    |
| Columns menu / cells | cells read "Loading…" (§5.2)                                                     | the button is shaded with its reason (§5.2)                                                                             | cells read "Unavailable"; one `role="status"` sentence above the table: "Area’s values could not be loaded." (one sentence, not one per cell) |
| Editor Codes section | pickers at full size, labelled; `selectedLabel` "Loading…" until `names` arrives | §7.2                                                                                                                    | an inline error with Retry; the Save is shaded with "Codes could not be loaded."                                                              |
| Bulk bar             | the value picker's `loading` row                                                 | Code select: "This plan has no codes" (shaded, with the reason)                                                         | `role="alert"` under the bar, through `code-errors.ts`                                                                                        |

**Write errors** go through `code-errors.ts`, using the spec's §2 sentences:

| Reason                                 | Sentence                                                                    |
| -------------------------------------- | --------------------------------------------------------------------------- |
| `CODE_TYPE_NAME_TAKEN`                 | "A code type called Area already exists."                                   |
| `STALE_VERSION`                        | "Someone changed this. Reload to see it." with the `withReload` action      |
| `CODE_TYPE_LIMIT` / `CODE_VALUE_LIMIT` | the server's sentence                                                       |
| `CODE_VALUE_DELETED`                   | "That value was deleted."                                                   |
| `PARENT_DELETED`                       | "Restore Area first."                                                       |
| `CODE_TYPE_IS_SWIMLANE_SOURCE`         | the owner's Q3 sentence (it cannot happen until M4 lets a source be chosen) |

Field problems are found on the client first, by `code-text.ts`. The first invalid field takes focus
(the swimlane dialog precedent, `SwimlaneManageDialog.tsx:133-153`).

---

## 11. Accessibility: keyboard, focus, pen, pointer

**Primitives whose keyboard contract is exercised (ADR-0111).** All are used as they are; none
changes its keys:

- `Tabs` (vertical, a new consumer)
- `Dialog`, with stacked rename, edit and delete dialogs above Codes… (the swimlane precedent)
- `Combobox` (a new consumer, loaded through `onQueryChange`; no prop change)
- `Menu` (`menuitemcheckbox`, shaded items reachable, ADR-0082)
- `DataTable` (windowed)
- `Disclosure`
- `TextField` and `SelectField`

`RowActionButton` is extracted, not changed. **accessibility-reviewer and component-reviewer run
before T1 and before T3 ship** (plan.md:345), because each composes these in a new way inside a
native `<dialog>`. Both known failure classes are in play: a top layer that swallows a portalled
popup, and focus lost when a control unmounts.

**Focus rules:**

1. **Opening Codes…** focuses the active tab. That is the first type, or the Add form's field when
   there is none.
2. **Adding a type** selects the new tab and puts focus in the pane's **Add value** field: the next
   thing to type is a value.
3. **Adding a value** keeps focus in the Add value field. The field is cleared and the addition
   announced ("Value L1 added to Area.").
4. **Moving** keeps focus on the control that moved, through the `refocus` layout effect
   (`SwimlaneManageDialog.tsx:82-90`). The move is announced ("L1 moved to position 2 of 4.").
5. **Deleting** a value moves focus to the next row's same action, or to the previous row's, or to the
   Add value field (`focus-after-delete.ts`, the swimlane helper, reused). Deleting a type selects the
   neighbouring tab and focuses it.
6. **Someone else removes the control you were on** (a refetch drops the active type or a value row):
   `use-container-unmount-handoff` hands focus to the same neighbour (ADR-0135). Covered by a component
   test, and by the journey with a second session (§12).
7. **Stacked dialogs** return focus to the control that opened them (the `Dialog` contract).
8. **Pen lost mid-dialog:** controls shade in place and focus does not move (ADR-0204's reason for
   `aria-disabled` over `disabled`).

**Pen sentence.** One sentence at the top of the dialog, the editor section and the bulk bar, built by
`penReason('change codes', holder)` (`activity-editor-gating.ts:95-96`). Every shaded control points to
it with `aria-describedby`. Text fields are `readOnly` (ADR-0083), not `disabled`.

**1024 × 600 (ADR-0179).** At 1024 the xl dialog is 896 px wide: a 208 px rail and a pane of about
650 px, enough for the values table's four columns and its four row buttons. At 600 px high the dialog
body is about 430 px between its title and Close. Each pane **scrolls on its own** and the dialog itself
does not, so the rail and its Add form stay in view while the values scroll. Below 1024, content still
reflows (WCAG 1.4.10): the rail stacks above the pane and scrolls itself. No layout is designed below
the floor. The Activities panel header wraps (`activity-bottom-panel.tsx:286`).

**Coarse pointer (ADR-0118/0183).** Row buttons use `size="icon-row"`, which grows to `--control-h`
under `pointer-coarse` (`button.tsx:71`). Fields and buttons use the existing control-height tokens.
No new size is added.

**Never colour alone.** Deleted rows say "Deleted" in text. The value count is text.

---

## 12. The journey: `e2e-swimlanes/codes.spec.ts` (F7)

It runs against the seeded `plan:capability-codes` (`apps/seed-cli/src/capabilities/codes.ts`): Area
(L2 unused), Trade (FIN unused), Phase (unused by every activity), and CD_8 with no code at all. The
suite's `openSeededPlan` takes a family and a plan-link name; today `swimlanes` is fixed in it
(`support.ts:134-173`). The pen is enforced, there are no flags, and the viewport is 1646 px with one
case at 1024 × 600.

| Lands with | Steps                                                                                                                                                                                                                                                                                                                                                                 |
| ---------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| T1         | Open **Codes…**: three tabs in order; Area's pane lists GF, L1, L2, RF. Add type "System" and value "HVAC". Rename L2. Move RF up. Delete L1, then check CD_3 has no Area through the API, then undo, then check CD_3 has L1 again. Shaded with the pen sentence when the pen is not held. axe clean. 1024 × 600: both panes scroll and the Add forms stay reachable. |
| T2         | Activities ▸ **Columns** ▸ Area: the column reads "Ground floor" on CD_1 and "—" on CD_7. Reload: still shown (URL). Gantt `View ▾ ▸ Columns ▸ Codes ▸ Trade` shows a read-only column. axe clean.                                                                                                                                                                    |
| T3         | Editor on CD_5 ▸ General ▸ Codes ▸ Trade = MEP ▸ **Save codes**; History reads "Trade set to Mechanical, electrical and plumbing"; undo. Tick CD_7 and CD_8 ▸ **Set Area** ▸ Roof: one request, both read Roof; undo returns both. Duplicate CD_1: the copy carries GF and CIV. axe clean.                                                                            |

`docs/TEST_PLAYBOOK.md` gains no plan. A "Look at" row for the UI is optional. Keep the API rows as
the truth.

---

## 13. Task split

| Task   | Scope                                                                                                                                                                                                                                                                                            | Must test                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 | Reviewers                                                                                                |
| ------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------- |
| **T0** | §3: `values=none` and `valueCount`; `GET code-types/:id/values`; `GET code-values?id=`; `codes` on the detail GET; cursor UUID validation; constants into `@repo/types`. OpenAPI, `docs/API.md` "Codes", #562 row updated (bullets 1, 2 and 8 closed; 3, 4 and 6 left with the reasons in §3.5). | **API e2e:** `values=none` shape and `valueCount`, with the default unchanged (byte-compare a playbook read); paging and order across pages; `limit` bounds (0, 1,001: 422); cursor not a UUID: 422; `include=deleted` 403 without `code:restore` and correct with it; a foreign, deleted or unknown type: 404; resolve with 0 or 101 ids: 422, foreign ids absent, deleted value and deleted type named; detail GET `codes` absent on a no-type plan (SC-2) and present on the coded plan. **Census:** `soft-delete-filter` declarations; audit coverage (reads). **Measure** (extend `codes-reads.measure.ts`): the values route at 1,000 values, the resolve route at 100 ids, the detail GET with and without codes, recorded in `m2-record.md` or an `m3-record.md`. | api-reviewer, security-reviewer (§3.3), backend-performance-reviewer                                     |
| **T1** | §4 skeleton, §5.1, §6 keys, the type and value mutation hooks, the type and value undo commands (§8.2 first five rows), `COVERAGE`, the panel-header **Codes…** entry, the `RowActionButton` extraction, the ADR-0061 §3 amendment note, the journey skeleton (§12 T1).                          | **Component:** every state in §10; pen and role shading (ADR-0083 D5 summary against shaded); the delete sentence counts from the activity cache; focus rules 1–6; a reorder sends every live value with current versions. **Undo:** each command against `fake-plan-server` (applied, gone, changed, parent-deleted). **Structural:** no `setQueryData` on the activity list (§6.2). `pnpm prepush`; `scripts/e2e-local.sh web:swimlanes` (the suite name is the config's).                                                                                                                                                                                                                                                                                              | accessibility-reviewer and component-reviewer **before release** (ADR-0111), ux-reviewer (copy, spec §0) |
| **T2** | §5.2: `CodeColumnsMenu`, table code columns, Gantt `View ▾ ▸ Columns ▸ Codes`, `acodes` and `gcodes` with router validation, the shared `codes` width, `codeValueName`.                                                                                                                          | `ActivitiesTable.render-count.test.tsx` **unchanged and green**; cell states (value, "—", Loading…, Unavailable); the cap shades the 11th item with its reason; URL round trip including a deleted type's id dropped and "nothing shown" left as default; the print document has no code columns; a hidden type fires no values request. Journey §12 T2.                                                                                                                                                                                                                                                                                                                                                                                                                  | component-reviewer, accessibility-reviewer (the menu)                                                    |
| **T3** | §7, §8.1, `activityCodesCommand`, §8.4 paste, §9 history, the five `surface-contract.json` entries `activities/update-activity-codes.*` (`:92-106`) changed from `gap` to `surface` (naming `features/codes/api/use-write-activity-codes.ts`), the clone-census reason.                          | **Editor:** a codes save sends only the changed types with `version`; the General Save does not send codes and the codes Save does not send definition fields (key-set assertions, as `scope-bodies` have); `codes` in the gating identity test; unsaved-work registration. **Bulk:** `code-assignment-plan` (unchanged rows skipped; 2,000 cap). **Undo:** checks via the detail `codes` (≤ 5 rows) and via the list (> 5) give the same answer; `CODE_VALUE_DELETED` → set aside with the sentence. **Paste:** codes PATCH between creates and carriage, carriage uses the returned versions, a failure rolls back. **History:** every row of §9, and no `code:` line starts with `Code `. `pnpm check:surface-contract`. Journey §12 T3.                               | accessibility-reviewer and component-reviewer before release; ux-reviewer                                |

T0 comes first. T1 and T2 can run in parallel after it. T3 needs T0 (detail `codes`) and T1 (keys,
`use-codes-actions`).

---

## 14. Trade-offs and risks

| Choice                                                                     | Rejected option                                    | Why                                                                                                                                                                                                                       |
| -------------------------------------------------------------------------- | -------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Per-type value loads for columns, resolve-by-id for the editor and history | one approach for everything                        | Columns can show every value in use, so loading the type is the cheapest. The editor and history need a few known ids across many types, so resolving them is cheapest. Each one avoids the other's worst case (§2).      |
| Codes as their own editor scope (F1)                                       | "saved with the definition scope" (spec §4.8)      | ADR-0060 §3 rejects a two-endpoint Save on the grounds of atomicity and honesty.                                                                                                                                          |
| `Tabs` rail in the dialog                                                  | a list of buttons; a new Listbox primitive         | One tab stop and an existing reviewed contract. It costs an ADR-0061 §3 amendment note.                                                                                                                                   |
| Table Columns menu lists codes only                                        | a general column chooser for every table column    | Only code columns are optional in the table. A general chooser is a first instance with no second caller.                                                                                                                 |
| Shown-list URL params                                                      | the Gantt's hidden-list                            | "Off by default" is the owner's decision, and a hidden-list would turn new types on for old URLs.                                                                                                                         |
| One shared code-column width                                               | per-type widths                                    | Keeps the device record bounded. It can be added later without loss.                                                                                                                                                      |
| Journey in `e2e-swimlanes`                                                 | `activity-editor` (plan); a new `e2e-codes` config | It has the seeding harness, the enforced pen and the floor cases, and needs no new config or CI step (ADR-0105, ADR-0138). The cost is a suite whose name says less than it covers, and a longer shard: measure it in T1. |

- **Risk: automatic activation fires a request per arrow** in a big rail. It is bounded by the cache
  and by the 30 s staleness. Measured in T1, and the remedy is named (§5.1).
- **Risk: deleted names to `code:read`** (§3.3). This is a new reading of a permission rule, and
  security-reviewer decides it. The fallback is that readers without `code:restore` see "a deleted
  value" and the editor uses per-type loads.
- **Risk: the shard grows.** `e2e-swimlanes` gains about three cases. Record the shard time in T1 (ADR-0138).
- **Risk: M4 forgets lanes on the bulk write.** `code-assignment-plan.ts` is the one place that will
  change (§7.3).

---

## 15. Implementer checklist

- [ ] T0 lands first. `docs/API.md` and OpenAPI are updated. The #562 row is updated in place, not deleted.
- [ ] No new primitive. `RowActionButton` is extracted with its tests moved, not copied.
- [ ] `features/tsld` gains no import (#548). `features/activities` does not import `features/codes`.
- [ ] Every write is pen-shaded with one sentence. Fields are `readOnly`, buttons `aria-disabled`, and
      nothing is natively `disabled` where focus can sit.
- [ ] No `setQueryData` on the activity list. The structural test is in place.
- [ ] `ActivitiesTable.render-count.test.tsx` is unchanged and green.
- [ ] Every new mutation has a `COVERAGE` entry. Undo commands are tested against `fake-plan-server`.
- [ ] Copy never says bare "activity code" or "Code" for a classification (spec §0). ux-reviewer has
      read every string.
- [ ] The five `surface-contract.json` gaps are `surface`. The clone-census reason is updated.
- [ ] ADR-0061 §3 amendment note. The epic ADR (M7) records F1 and §3.3.
- [ ] `pnpm prepush`; `scripts/e2e-local.sh api` (T0); `scripts/e2e-local.sh web:swimlanes` (T1–T3).
- [ ] accessibility-reviewer and component-reviewer have run on T1 and T3 **before** release (ADR-0111).
- [ ] Changesets: `api` minor (T0), `web` minor (T1–T3).

---

## Owner questions

1. **When you print the Gantt, should the code columns you have switched on print too?**
   _Recommended: not in this first version._ The printout keeps its usual columns, as it does today for
   the Swimlane column. We can add codes to the printout later if you want them.

2. **Should you be able to set a code from the diagram's selection bar, as well as from the Activities
   table?**
   _Recommended: the table only for now._ The diagram gets it in the next step, when you can group the
   diagram by a code, so that it is built once, in the place where it matters.
