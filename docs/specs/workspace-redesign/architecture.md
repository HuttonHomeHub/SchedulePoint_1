# Plan workspace redesign — component & state architecture

> **Status:** proposed, for approval before implementation.
> **Scope:** `apps/web` only. No `apps/api`, no Prisma, no engine, no migration.
> **Flag:** none. Replace in place; the rollback is reverting the commit.
> **Authority:** [`approved-mockup.html`](approved-mockup.html) for palette, geometry and
> behaviour; [`README.md`](README.md) for the eight decisions. This document adds only the
> component and state architecture needed to build them well.

The visual design is settled and is not re-opened here. Where the existing code, an existing
gate, or an existing decision **contradicts** the approved design, this document says so and
proposes the replacement rather than bending the design (§9, §10).

Standards are rewritten afterwards, from what ships. Nothing below argues from an ADR number.
Where a past decision is cited it is because the _code_ still behaves that way and the
implementer will meet it.

---

## 0. The shape

Everything in this document hangs off one layout change, so it comes first.

The mockup's workspace is four stacked full-width bands with a horizontal split in band 3:

```
┌──────────────────────────────────────────────────────────┐
│ identity line   (brand · crumb · MODE segments · pen)    │  auto
├──────────────────────────────────────────────────────────┤
│ command deck    (4 captioned groups, wrapping)           │  auto
├───────────────┬──┬───────────────────────────────────────┤
│ Explorer      │▎ │ stage (TSLD canvas / Gantt)           │  1fr
│  or 34px spine│  │                                       │
├───────────────┴──┴───────────────────────────────────────┤
│ status bar      (facts · schedule state)                 │  auto
└──────────────────────────────────────────────────────────┘
```

Today's shell (`components/layout/navigator/app-shell.tsx`) is
`grid-cols-[auto_minmax(0,1fr)_auto] grid-rows-[auto_minmax(0,1fr)_auto]` with a 48 px tool rail
owning column 1 for **all three rows**, and the Project Explorer in a trailing drawer.
The redesign makes it:

```
grid-rows-[auto_minmax(0,1fr)_auto]     // chrome band | body | status band
  row 1  ChromeSlot "rows"              // identity + deck, portalled by the workspace
  row 2  <div class="grid grid-cols-[auto_auto_minmax(0,1fr)] min-h-0">
           Explorer | PanelResizer | <main><Outlet/></main>
         </div>
  row 3  ChromeSlot "status"
```

Two properties fall out of this and both are load-bearing:

1. **Rows 1 and 3 span the full width**, so the Explorer's width can never change the deck's or
   the status bar's. This is the same geometric argument the current shell already uses for the
   drawer, moved one row up. It is stated here because §E's hard constraint ("a band's own width
   must never be an input to a fit decision") is satisfied _twice_: the deck does not read a
   width at all, **and** its width does not vary with the panel beside it.
2. **Rows 1 and 3 are `auto`**, so a screen that portals nothing into them is a zero-height row.
   The twelve non-plan routes keep the frame they have. That property is the reason the chrome
   slot mechanism survives this redesign unchanged (§F).

The Explorer stays **the shell's**, not the workspace's, even though the mockup draws it inside
the workspace body. Three reasons, all still true independent of any ADR:

- It navigates _between_ plans. Mounting it inside the plan route makes it unmount and refetch on
  every plan→plan navigation, losing its expansion state (`features/navigator`'s
  `useExpansionState`) and its warm cache — which is the state that makes the tree usable at all.
- It must render on the organisation routes (`/orgs/:slug`, `/orgs/:slug/clients`, …) where
  there is no plan.
- Making it the workspace's would mean the workspace owns the body's grid, and then rows 1 and 3
  would have to be told the Explorer's width to stay aligned — reintroducing exactly the
  measurement this design removes.

---

## A. The command deck

### A.1 The question

Does the registry keep its shape with a new renderer, or does it need a different item contract?

**Answer: the registry keeps its shape; the _contract_ is narrowed by five fields; the renderer
is new.** The reason is that `Toolbar.tsx` does three separable jobs and only one of them is
being deleted:

| job                                                                                                                     | where it lives                                                                                                                                 | verdict             |
| ----------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------- | ------------------- |
| resolve items against the plan context (`isVisible`/`isEnabled`/`isActive`/`disabledReason`/`icon`/`isBusy`/pen-gating) | `resolveItems` in `toolbar-registry.ts`                                                                                                        | **keep, unchanged** |
| fit them into a fixed-height row by measuring width and demoting into `⋯`                                               | `computeLadder` (`toolbar-ladder.ts`), `deriveChromeWidth`, `measureLabelWidth`, `resolveLayoutMode`, `useToolbarBandWidth`, `ToolbarOverflow` | **delete entirely** |
| render an APG toolbar with roving tabindex and `role="group"` per taxonomy group                                        | `Toolbar.tsx`                                                                                                                                  | **replace**         |

The registrations (`features/tsld/toolbar/tsld-toolbar-items.tsx`, ~2900 lines, ~40 items) are
almost entirely job 1. They are the asset. Nothing in a registration says anything about width
except the five fields listed below.

### A.2 What becomes dead, and what breaks

All five are **removed**, not left inert. Leaving a field inert means the next author declares
it, believes it does something, and is wrong — which is the single most common defect class this
repository has recorded. Every removal is a **compile error at each declaration site**, which is
the point: a mechanical sweep with the compiler as the checklist, not a search.

| field                            | why dead                                                                                                                                                                                                                                                                              | what breaks                                                                                                                                                                                   | count     |
| -------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------- |
| `tier: ToolbarTier`              | only `partitionByTier` read it, to seed the always-overflow set. There is no overflow.                                                                                                                                                                                                | `partitionByTier` (delete), `defineToolbar`'s `demotionGroup`-shares-a-tier guard (delete), `Toolbar.test.tsx`, `toolbar-registry.test.ts`. **Required field**, so every registration errors. | ~40 sites |
| `priority?: number`              | the demotion queue's sort key, and `computeLadder`'s label-withdrawal order. Both gone.                                                                                                                                                                                               | `priorityOf` (delete) + its tests. One real declaration (`recalculate: 95`) plus a handful.                                                                                                   | ~4 sites  |
| `showLabel?: ToolbarLabelPolicy` | a four-shape union (`'always' \| 'auto' \| 'never' \| {atLeast}`) that existed only to answer _"can this row afford a word?"_. The deck's rule is a design decision, not an affordability one: **labelled, except six universal icons.**                                              | replaced by `iconOnly?: true` (see below). `bandIsAtLeast`, `labelPolicy` (delete).                                                                                                           | ~14 sites |
| `demotionGroup?: string`         | pairs two halves of a segmented control so they demote together. Nothing demotes, and the four items that used it (`mode-early`/`mode-visual`, `view-tsld`/`view-gantt`) leave the deck for the identity line, where the pairing is expressed by a real `SegmentedControl` component. | `defineToolbar`'s two guards (delete both), `companionsOf`.                                                                                                                                   | 4 sites   |
| `presentational?: boolean`       | a read-out that renders inline but is not a roving stop. The deck has no read-outs: the project-finish chip is already in the status bar, and `next-conflict-status` folds into the `next-conflict` button as a count (mockup: a `.warn` button reading **“1 conflict”**).            | `next-conflict-status` is deleted as an item; the flag-off search stub (its other consumer) is deleted with the flag.                                                                         | 2 sites   |

**On folding the conflict count into its button.** That was measured and _refused_ once, because
a context-bearing label re-ran the width ladder on every activation — moving controls under the
planner's cursor between two presses of the same button. **Deleting the ladder voids that
objection**, which is a real dividend of this epic and worth naming. The residual is smaller and
must still be handled: a label growing from `Next conflict` to `1 conflict` changes the Find
group's width and can rewrap the deck. Mitigation: the count is rendered in a fixed-width
`tabular-nums` slot sized for two digits, so the button's box is stable from 0 to 99.

### A.3 What is added

Exactly one field, so the contract stays the same size:

```ts
/** Draw a hairline rule immediately before this item within its deck group. */
dividerBefore?: true;
```

This replaces the `.rule` spans the mockup hand-writes. It is a single explicit mechanism.
(The alternative — deriving a rule from a change of taxonomy group — was rejected: it produces
the right rule in the View and Plan groups by luck and cannot produce Author's _two_ rules at
all, since Add/Link/Select/Pan/Arrange, Undo/Redo and Note are all `tools`. Two mechanisms for
one hairline is how they come to disagree.)

Plus one narrowing:

```ts
/** Icon-only. The six genuinely universal icons; everything else is labelled. */
iconOnly?: true;

/** Which surface renders this item. */
surface?: 'deck' | 'identity';     // was `row?: 'mode' | 'strip'`
```

`splitByRow` becomes `splitBySurface`, keeping its `Record`-indexed shape (a ternary silently
mis-partitions when a third value is added; the record makes it a typecheck failure).

### A.4 Four groups from seven, and why both vocabularies survive

The mockup's deck has four captioned groups — **View, Find, Author, Plan**. The registry has a
seven-value taxonomy. Reading the mockup's group contents against the taxonomy:

```
View   : Today, Zoom−, Zoom+, Fit  │ Baseline, Resources, Over-alloc, Legend, Minimap, Dates
         └────── frame ──────┘        └──────────────── lens ─────────────────────────┘
Find   : Search, Filter, Float paths, Logic, 1 conflict, Isolate      ← all `find`
Author : Add, Link, Select, Pan, Arrange │ Undo, Redo │ Note          ← all `tools`
Plan   : Summary, Analysis, Calendar, Baselines, Settings, Comments │ Export, Print, Share
         └──────────────── object ────────────────────────────────┘   └──── output ────┘
```

The seven-group taxonomy **is** the divider structure inside the four captioned cards. So both
survive with clean, separate jobs:

- **`DeckGroupId`** (`'view' | 'find' | 'author' | 'plan'`) — the captioned, collapsible card.
- **`ToolbarGroupId`** (the existing seven) — ordering within a card, via `groupRank`.

Bridged by one total map in `toolbar-registry.ts`:

```ts
export const DECK_GROUP_OF: Record<ToolbarGroupId, DeckGroupId> = {
  frame: 'view',
  lens: 'view',
  find: 'find',
  tools: 'author',
  object: 'plan',
  output: 'plan',
  help: 'plan',
};
```

Total by type, so adding a taxonomy group is a compile error rather than an item that silently
lands in the wrong card. Every existing registration is untouched, which is the whole reason to
do it this way rather than re-tagging ~40 items.

### A.5 Wrapping, without measurement

```
.deck              display:flex; flex-wrap:wrap; align-items:flex-start; gap:9px
  .group           flex:0 0 auto; max-width:100%
    .caption       <button aria-expanded>  (the group's accessible name)
    .items         display:flex; flex-wrap:wrap; gap:4px
```

There is **no `ResizeObserver`, no `clientWidth` read, no band context, no hysteresis and no
constant** anywhere in the deck. The browser's flex line-breaking is the entire fit algorithm.
Height is content-driven, and the shell's `auto` row 1 passes that height straight through to
`minmax(0,1fr)` row 2 — the stage shrinks by exactly the deck's height, computed by the layout
engine.

That is the _only_ remaining coupling between chrome and canvas height, and it is the honest one:
it is CSS layout, not a JS decision that can be wrong.

`components/ui/toolbar/toolbar-band.tsx` is deleted with the ladder. It exists solely to keep a
band width from being read as a row width; with nothing reading either, it has no subject.

### A.6 Keyboard model

`role="toolbar"` on the deck; `role="group" aria-labelledby={captionId}` per deck group.

- **One roving tab stop for the whole deck.** Tab enters at the last-focused control; Tab leaves.
- **The caption button is a roving stop**, first in its group. Arrow keys therefore walk
  `View caption → View items → Find caption → Find items → …`, which gives keyboard collapse for
  free and reads correctly.
- `ArrowRight`/`ArrowLeft` walk the linear sequence across wrapped rows; `Home`/`End` jump to the
  ends. `ArrowUp`/`ArrowDown` stay aliased to left/right, as today.
  **Cost, stated:** on a wrapped deck, `ArrowDown` does not move down. Two-dimensional arrow
  navigation needs geometry (`getBoundingClientRect` per item), which is a measurement this design
  otherwise has none of, and it changes meaning as the deck rewraps. Linear is what the APG
  toolbar pattern specifies and it is what ships. Revisit only if the product owner reports it.
- A collapsed group renders **no items at all** (`display:none` on the row), so they leave the
  roving sequence by construction rather than by a filter. A planner who collapses _Author_ loses
  arrow access to Add/Link — that is what collapsing means, and the keyboard shortcuts are
  unaffected.
- A disabled item keeps `aria-disabled` (not the native attribute) so it stays focusable and its
  `aria-describedby` reason is reachable. That behaviour is `ToolbarButton`'s today and moves to
  `DeckButton` unchanged.

### A.7 Per-group collapse — where the state lives

Per **user**, in `localStorage`, one key, not per plan and not per org: it is a chrome preference
and a planner who folds _Plan_ away means it everywhere.

```
key    schedulepoint-deck-groups
value  {"view":false,"find":false,"author":false,"plan":true}
```

`useResizablePanelPrefs` does **not** fit (it is `{collapsed,size}` for one panel), so this is a
small dedicated `useDeckGroupPrefs()` in `components/ui/deck/`. Same shape: read once in a lazy
initialiser, write in an effect, ignore corrupt storage and fall back to all-open.

### A.8 The renderer's props

```ts
interface CommandDeckProps<Ctx> {
  items: ToolbarItem<Ctx>[]; // the registry, surface-filtered
  context: Ctx;
  label: string; // aria-label on role="toolbar"
  authoringEnabled: boolean; // pen-gated items shade as a set (unchanged)
  groupLabels?: Partial<Record<DeckGroupId, string>>;
}
```

Note what is **absent**: no `alignEndGroup`, no `orientation`, no `className` width hooks. A
wrapping deck has no trailing edge to align to and no vertical variant.

---

## B. The docked Project Explorer

### B.1 The existing primitive — found, and it fits

There are two, and together they are exactly what this needs:

- **`apps/web/src/components/ui/use-resizable-panel-prefs.ts`** — `useResizablePanelPrefs({
storageKey, min, max, defaultSize })` → `{ collapsed, size, collapse, expand, setSize }`.
  Clamps on read _and_ on write, persists `{collapsed,size}` under **one** key, ignores corrupt
  storage. Already the single implementation behind the old Explorer rail, the activity panel,
  the notes dock, the float-paths dock and the context drawer.
- **`apps/web/src/components/ui/panel-resizer.tsx`** — `PanelResizer`, a focusable APG window
  splitter (`role="separator"`, `aria-valuenow/min/max`, pointer drag coalesced to one
  `onResize` per animation frame, arrows nudge 16 px, Home/End jump to the bounds,
  `reverseKeys` for end-anchored panels, and a ≥24 px invisible pointer hit area over the 1 px
  divider).

**Use both. Do not write a new one.** Everything the mockup's `.divider` does by hand
(`pointerdown` → capture → clamp 200–420 → set a custom property) `PanelResizer` already does,
plus the keyboard half the mockup does not have — and the product owner drives by keyboard.

Three adaptations:

1. The Explorer is **start-anchored** (leading edge), so `reverseKeys` is **not** set: drag right
   grows it, `ArrowRight` grows it. `pointerToSize` is `(e) => e.clientX - bodyLeft`.
2. The clamp changes to the mockup's numbers: `min 200, max 420, default 276` (`--exp-w:276px`).
   An existing stored 480 from the old rail is clamped down to 420 on read — no migration needed.
3. Style it to the mockup's `.divider`: 12 px wide, `cursor:col-resize`, a 3 × 38 px grab pip
   that goes amber and 60 px tall on hover. `PanelResizer` takes a `className` for exactly this.

### B.2 Where the persisted state lives

**Per user, in `localStorage`, one key, shared by width and collapsed state:**

```
key    schedulepoint-explorer
value  {"collapsed":false,"size":276}
```

- **Per user, not per plan.** How wide the navigator is has nothing to do with which plan is
  open; a width that changed when you switched plans would read as a bug.
- **Per user, not per org.** Same argument one level out, and a per-org key means a planner who
  narrows it in one organisation finds it wide in the next.
- **One key, not two.** They are read together on mount and written together on change; two keys
  is two chances for one to be present and the other missing.
- `localStorage`, not the URL and not the server. It is view chrome, it must survive a reload,
  and it must not appear in a link a planner shares.

The old `schedulepoint-context-drawer` key is orphaned by this change. Do not migrate it — the
value is a _trailing_ drawer's width for a panel that no longer exists, and the default is
correct for the new one.

### B.3 The collapsed spine

34 px, a single `<button>` filling the column:

```
aria-label   "Open Project Explorer"
aria-expanded false
aria-controls the panel's id
```

with a vertical `writing-mode:vertical-rl` "EXPLORER" caption and a panel icon, per the mockup.

**Focus on collapse is the thing most likely to be got wrong.** Collapsing unmounts the panel —
including the collapse button the planner just pressed — and the browser drops focus to `<body>`,
which silently kills every workspace keyboard accelerator (they are React handlers on the
workspace root). This repository has shipped that defect at least four times in different
controls. So:

- collapsing moves focus to the **spine**;
- expanding moves focus to the panel's **collapse** button;
- both are asserted in the journey, not only in a unit test, because a unit test cannot see the
  unmount ordering that causes it.

The transition is announced once through the existing shared announcer
(`components/ui/announcer`) — "Project Explorer closed." / "opened." — not a second live region.

### B.4 Escape

Escape does **not** close the Explorer. It is a persistent, non-modal, deliberately-opened panel
on the leading edge, and the workspace's Escape ladder (tool → open link pick → selection) is
already three rungs deep on the canvas beside it. Adding a fourth rung that removes a planner's
navigation on a keystroke aimed at a tool is a worse outcome than having no shortcut. The current
shell wires Escape to the _trailing_ drawer; that wiring is deleted with the drawer (§F).

---

## C. The staleness model

This is the decision most likely to be fudged into reporting a wrong number, so it is specified
as a state machine with named boundaries.

### C.1 What the number means

> **`pendingEdits` = the number of scheduling-input writes _this client has issued and the server
> has accepted_ since the last _successful_ recalculation of this plan.**

Not "changes to the plan". Not "distance from the computed state". Not "actions you took".
Writes this client made that the engine has not yet consumed.

### C.2 It is not derivable from existing client state — checked, not assumed

Four candidates, all rejected on evidence:

- **The ADR-0032 coalesced-recalc hold** (`features/schedule/api/use-plan-auto-recalc.ts`) —
  `hold`/`release` is a `Set<symbol>` of open gestures and `isPending` is a boolean about one
  HTTP request. Neither counts anything. `notify()` is called by every write path, so it is the
  right _seam_, but it carries no count and it is also called by the observer effect below.
- **The undo stack** (`features/undo-redo/use-plan-edit-history.ts`) — coalesces same-key commands
  within a 500 ms window (a whole drag is one entry), caps at `MAX_HISTORY_DEPTH = 50`, is cleared
  on plan switch and on pen loss, and only records commands with a registered inverse. Progress
  edits, several table edits and the LOE span are not on it. It would under-count, and it would
  reset to zero for reasons that have nothing to do with calculation.
- **The `structureSignature` effect** (`use-plan-workspace-model.ts:589-615`) — a sorted string of
  each activity's `type/durationDays/constraint*/parentId` and each dependency's `type/lagDays`,
  diffed against the previous observation. It is exactly the right _predicate_ (it excludes the
  engine-computed fields a recalculation writes back, so a settled recalc cannot re-trigger it),
  and it is exactly the wrong _counter_: a diff yields a boolean, and it fires for **any** observed
  change including a colleague's. The query client is `refetchOnWindowFocus: true` with
  `staleTime: 30_000` (`lib/query/query-client.ts`), so a peer's twelve edits arrive in one refetch
  when the tab regains focus and a signature-driven counter would attribute all of them to you as
  **one**.
- **The API** — there is no general staleness field. `PlanScheduleSummary.scheduleStale` is
  present **only** for a plan with at least one cross-plan edge and means "an upstream plan was
  recalculated more recently than this one"; it is `undefined` on every ordinary plan.
  `schedule_computed_at` is stamped server-side but is not on any DTO the web app reads. Adding
  one is an API change and out of scope.

**So this is new client state.**

### C.3 Where it is incremented — the load-bearing choice

**In the `onSuccess` of the scheduling-input mutation hooks, not at the call sites.**

The alternative — passing a count into `autoRecalc.notify()` at each of its ~12 call sites in
`use-plan-workspace-model.ts` — was considered and rejected for one concrete reason: the
`structureSignature` effect is one of those call sites, and it is the _only_ route by which an
edit made in the activities table, the activity editor or the logic panel reaches the coalescer.
Passing `0` there under-counts the edits a planner makes most; passing `1` there counts a peer's
refetch as your edit. There is no correct constant.

The mutation hooks are the seam where "a write this client made" and "a write that changes a
scheduling input" are both true and both knowable. The set is bounded and enumerable:

```
create / update / delete activity          features/activities/api/use-activities.ts
update activity fields (partial PATCH)     features/activities/api/use-activities.ts
update activity parents (batch)            features/activities/api/…
create / update / delete dependency        features/dependencies/api/…
set visualStart / clear visual placement   features/activities/api/…
batch placements (bulk move)               features/activities/api/…
create placed activity, LOE span           features/activities/api/…
dissolve summary                           features/activities/api/…
```

Each calls `reportScheduleEdit()` from `usePlanStaleness()` in its `onSuccess`. A peer's edit is
structurally invisible to this seam, because a peer's edit is not a mutation in this client.

**Gate:** a structural test asserting that every hook exported from those modules whose HTTP verb
is not `GET` either calls `reportScheduleEdit` or appears in a short, commented
`NOT_A_SCHEDULING_INPUT` list. Without it, a hook added later under-counts silently, which is the
one failure mode of this design that nobody would ever notice.

### C.4 The four states, and why there are four rather than two

The mockup shows two: **current** (green tick) and **stale** (amber prompt + count + button).
Shipping only those would make the amber prompt strobe: every edit sets it, and the
auto-recalculation coalescer clears it ~500 ms later. A prompt that appears and vanishes on every
drag is noise, and worse, it asks the reader to act at a moment when nothing is asked of them.

```ts
type ScheduleState =
  | { kind: 'current' }
  | { kind: 'settling' } // the coalescer owns it; nothing is asked
  | { kind: 'stale'; edits: number } // n reported writes the engine has not seen
  | { kind: 'stale-unknown' }; // the plan changed; not attributable to us
```

| state           | status bar renders                                                                                                   |
| --------------- | -------------------------------------------------------------------------------------------------------------------- |
| `current`       | ✓ "Schedule is current" — the mockup's `.fresh`                                                                      |
| `settling`      | ⟳ "Recalculating…" — the spinner already in `PlanStatusBar`, widened from _in flight_ to _the whole settling window_ |
| `stale`         | the mockup's `.stale`: "3 edits since last calculation" + **Recalculate**                                            |
| `stale-unknown` | the same `.stale` chrome: "The plan has changed since the last calculation" + **Recalculate**                        |

Two appearances, four states. The amber prompt now appears **exactly when the planner must act**,
which is what makes it worth having at all.

`settling` requires one addition to `usePlanAutoRecalc`'s return, which today exposes only
`isPending` (a request in flight):

```ts
/** The coalescer owes a recalculation: a debounce timer is armed, a hold is open, or a run is in flight. */
isSettling: boolean;
/** The last run returned an error. The one durable stale state in the product today. */
lastRunFailed: boolean;
```

### C.5 The boundaries, precisely

The reducer is pure (`features/schedule/model/plan-staleness.ts`) and takes five events.

| boundary                                                                               | effect on `pendingEdits`                                                               | reasoning                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          |
| -------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **A write succeeds** (`report()`)                                                      | **+1 per accepted server write**                                                       | Not per keystroke, not per drag frame: the drag path already issues one PATCH per commit. A **bulk move of 12 bars is +1**, because `batchPlacements` is one write, one undo step and one thing to recalculate; counting 12 would make the number a measure of selection size. A **link chain of 5 edges is +5**, because it is five sequential writes. The asymmetry is deliberate and follows from the definition ("writes the engine has not consumed"), not from a guess about what a planner means by "an edit".                                                                                                                              |
| **A write fails**                                                                      | no change                                                                              | Nothing reached the server, so the engine's view is unchanged. A 409 or a 423 is surfaced by the existing conflict path.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| **An undo runs**                                                                       | **+1**                                                                                 | An undo is a write. It changes scheduling inputs and the engine has not seen the result. **Rejected: decrementing.** That reads the count as _distance from the computed state_, which is wrong the moment the undone edit had already been recalculated — the plan is then genuinely stale again and a decrement would print "Schedule is current" over a stale diagram. It is also not recoverable in general, because the undo stack coalesces and caps. A redo is likewise +1.                                                                                                                                                                 |
| **A refetch** (window focus, invalidation, the recalculation's own cache invalidation) | no change                                                                              | A refetch is an observation. This is also why `report()` is at the mutation seam and the signature effect is only a fallback: the invalidations a recalculation performs must never be read as edits. `structureSignature` already excludes every engine-computed field, which is what makes this safe.                                                                                                                                                                                                                                                                                                                                            |
| **A peer's edit arrives**                                                              | no change to `pendingEdits`; sets `unattributed`                                       | We cannot count what we did not write. If the signature changes with `pendingEdits === 0` and nothing reported, the state becomes `stale-unknown` and the sentence says **"The plan has changed"** — never "your edits". If the signature changes with `pendingEdits > 0`, it is presumed to be our own reported writes landing and nothing is set. **Note the rarity honestly:** scheduling-input writes are pen-gated and there is one pen, so with `PLAN_EDIT_LOCK_ENFORCED=true` this is close to unreachable; with the lock unenforced it is the ordinary case. The copy must be correct in both worlds, which is why it is not "your edits". |
| **A recalculation starts**                                                             | snapshot `pendingEdits` into `inFlight`; state → `settling`                            | Edits made _during_ the run still count: they land after the engine read its input.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                |
| **A recalculation succeeds**                                                           | `pendingEdits -= inFlight` (floored at 0); clear `unattributed`; clear `lastRunFailed` | Subtract the snapshot, never zero the counter — an edit issued mid-run must survive.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| **A recalculation fails**                                                              | `pendingEdits` unchanged; `lastRunFailed = true`; state → `stale`                      | **This closes a live defect.** `usePlanAutoRecalc.fire()`'s `onError` announces once into the polite live region and then the plan looks fine forever: the diagram shows dates the engine has not agreed to, and nothing on screen says so. Today there is no persistent surface for it at all.                                                                                                                                                                                                                                                                                                                                                    |
| **The pen is lost**                                                                    | `pendingEdits` unchanged                                                               | The edits are real and still uncomputed. The **Recalculate** button in the prompt shades with the pen refusal sentence; the count keeps telling the truth. Do not silently zero it — that would replace a true amber prompt with a false green tick.                                                                                                                                                                                                                                                                                                                                                                                               |
| **The plan changes / the component remounts**                                          | reset to `{ kind: 'current' }`                                                         | Keyed by `planId`, like the undo stack. A count is per plan by definition.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| **Auto-recalculation is disabled** (`canRecalc` false, or no data date)                | counts normally; state goes to `stale` rather than `settling`                          | This is the second durable stale case and the first one a Viewer or a pen-less Planner can reach. The button shades with its reason; the count is still the honest number.                                                                                                                                                                                                                                                                                                                                                                                                                                                                         |

### C.6 Where it lives

```
features/schedule/model/plan-staleness.ts        pure reducer + types (fully unit-testable)
features/schedule/model/use-plan-staleness.tsx   provider, keyed by planId; useReportScheduleEdit()
```

A context provider rather than a value threaded through `PlanWorkspaceModel`, because the
reporters are mutation hooks called from six different surfaces (canvas, table, editor dialog,
logic panel, Gantt grid, bulk bar) and threading a callback to all of them reproduces the
call-site problem C.3 rejected.

---

## D. The token layer

### D.1 The mockup's block

`.ws` declares 8 colours, 3 radii, 2 font families and 1 width, on one element:

```
--c-navy #14213D   --c-amber #FCA311   --c-amber-hi #FFC55A   --c-paper #FAF9F5
--c-crit #9E1B26   --c-crit-edge #6E0F17   --c-norm #4B7FC4   --c-norm-edge #31598F
--r-md 10px  --r-sm 7px  --r-xs 5px
--font-ui 'IBM Plex Sans'   --font-mono 'IBM Plex Mono'
--exp-w 276px
```

Everything else in the mockup is a literal or an alpha over navy.

### D.2 Evaluating the surface-scope mechanism on its merits for _this_ design

Not out of deference — on what this screen actually contains.

**The design has four distinct grounds visible simultaneously**, and the mockup proves it by
independently re-deriving the problem the mechanism solves:

| ground      | mockup                       | components on it                                                      |
| ----------- | ---------------------------- | --------------------------------------------------------------------- |
| navy        | `.ident`, `.deck`, `.status` | buttons, segmented controls, badges, the search field, the pen status |
| white panel | `.exp`, `.ovw`, `.menu`      | buttons, tree rows, menu items, headings, secondary text              |
| paper       | `.stage` / `.plot`           | the canvas painter's 86 token reads, the ruler, the bars              |
| gradient    | `.ws` itself                 | nothing — every child is a card                                       |

And it hand-writes **four separate button treatments** for the same control: `.b` (navy deck),
`.cta` (amber on navy), `.newc` (amber on white) and `.stale button` (amber on navy). In React
that is either a four-value `surface` prop threaded to every button — which is the thing the
mechanism exists to avoid — or a variant explosion at every consumer.

Two other facts weigh in:

- The brief says the Gantt stage, the activity editor and the org landing page follow "in the same
  language". A flat `--c-*` block on `.ws` cannot be reached by any of them.
- The mechanism's single documented failure — a **partial** family, where secondary text falls
  through to the page grey and vanishes on navy — is exactly what a flat 8-colour block would
  reintroduce. `.ident .who` is `#A8B6D2` and `.crumb .o` is `#A8B6D2`: the mockup has already
  discovered it needs a muted-on-navy ink, and hard-codes it in two places.

**Verdict: keep the mechanism; replace the values.** The mockup's palette lands as the _values_
of four scopes, not as a new vocabulary.

### D.3 How the values land

| mockup                                    | scope           | notes                                                                                                                                                                                                                                                    |
| ----------------------------------------- | --------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| navy bands (`.ident`, `.deck`, `.status`) | `chrome`        | `--chrome: #14213D`; `--chrome-primary: #FCA311`; `--chrome-primary-hover: #fff` (the mockup's `.cta:hover`); `--chrome-muted-foreground: #A8B6D2`; `--chrome-border: rgb(255 255 255 / 14%)`. Re-derive the whole 31-name family against the navy fill. |
| white panels (`.exp`, `.menu`, `.ovw`)    | `panel`         | `--panel: #FFFFFF`, `--panel-muted: #F1EFE8` (the mockup's header wash), `--panel-accent: rgba(252,163,17,.15)` resolved solid (the `.nd.here` selected row).                                                                                            |
| the stage (`.stage`, `.plot`)             | `canvas`        | `--canvas: #FAF9F5`. The criticality pair becomes `--plot-destructive` (`#9E1B26`) / `--plot-primary` (`#4B7FC4`) with their `-edge` values as the bar strokes.                                                                                          |
| the gradient (`.ws`)                      | **not a scope** | see D.5                                                                                                                                                                                                                                                  |

Component-level consequence: `Button`, `Input`, `Badge`, `Menu`, `SearchField` and the tree rows
need **no change at all**. `text-muted-foreground` inside the deck resolves to the navy-validated
grey because it is inside `<Surface tone="chrome">`. That is the dividend, and it is why the
deck's button styling is a CVA on semantic names rather than the mockup's literals.

### D.4 The `@theme inline` trap — how this answer stays out of it

The trap: Tailwind's `@theme inline` block emits its aliases (`--color-primary: var(--primary)`)
onto `:root`, and a `var()` in a custom property is substituted **on the element that declares
it**. So `getComputedStyle(scopedElement).getPropertyValue('--color-primary')` returns the
`:root`-resolved value and **cannot** see a surface rebind. Tailwind utilities were never
affected — `inline` is precisely what compiles `bg-primary` to `var(--primary)` rather than to a
frozen alias — which is why every DOM surface was correct while the canvas painter was not.

Three rules, all already satisfied by the current code and all of which must survive this epic:

1. **Runtime token reads name the unprefixed token** (`--primary`, `--border`, `--canvas`), never
   a `--color-*` alias. `render/palette.ts` already does this and says why in its docblock.
2. **The element handed to `getComputedStyle` is the scoped one.** `resolveTsldPalette(root)`
   takes the root as a **required** parameter and the stage supplies it via
   `<Surface tone="canvas" ref={…}>`. Keep the parameter required. The redesign moves the stage's
   DOM; it must not drop that wrapper. There is a known failure of exactly this on the guest share
   view, where `TsldPanel` mounts outside the provider — leave it or fix it, but do not create a
   second one.
3. **The contrast matrix cannot detect a violation of (1) or (2)**, because it resolves scopes by
   reading the CSS text and following the rebind itself — it asserts the mapping the browser does
   not perform. So the gate for this is the screenshot, plus the existing structural test that
   asserts every family token is reachable through `@theme inline`.

### D.5 Two things that are not scopes, and one that must be added

**The gradient is not a scope.** `.ws`'s `linear-gradient(135deg,#F2F5F9,#D3DCE9)` cannot be a
scope's `--background`, because every contrast assertion resolves a **single** colour and a
gradient has none. It becomes two page-level tokens (`--workspace-ground-from` /
`--workspace-ground-to`) applied by the workspace root, which is _not_ a `<Surface>`. This costs
nothing: no ink sits directly on the gradient — every child of `.ws` is a card with its own fill.
State that in the CSS so the next reader does not "fix" it by adding a scope.

**Radii need a real scale.** `--radius` is currently declared once, at `:root`, and every corner
in the product is a literal somewhere. Add `--radius-xs: 5px`, `--radius-sm: 7px`,
`--radius-md: 10px` to the theme block and map them into `@theme inline` (`--radius-*`), so
`rounded-md` means the design's 10 px. Declaring them in `@theme inline` directly would put a
design decision in the build config, which the "no token outside a theme block" rule forbids.

**The type ramp needs two members below `--type-micro`.** The mockup uses **9.5 px** deck labels
and **8.5 px** captions (`.modelab`, `.grp > .cap`). Neither is on the ramp, so the sizing ratchet
will fire on `text-[9.5px]`. Add them as real ramp members (`--type-nano: 0.594rem`,
`--type-pico: 0.531rem`) rather than taking an exemption. That is the ratchet working, not the
ratchet obstructing.

### D.6 Colour-space and alpha

- **Convert the hexes to OKLCH**, keeping the hex in a comment as provenance. The whole existing
  palette is OKLCH; a mixed-space block makes the derived hover/edge values un-derivable and the
  contrast matrix's arithmetic inconsistent with its inputs.
- **Resolve the alphas to solids.** The mockup uses `rgba(255,255,255,.08 / .11 / .17 / .18)` and
  `rgba(252,163,17,.14 / .16 / .22 / .55)` extensively. Every one of them composites over a
  **known solid navy**, so each has an exact solid equivalent — compute it at authoring time.
  Alpha values are invisible to the token census and to the contrast matrix, and this repository
  has already shipped a 3.8:1 label from a `hover:bg-secondary/80`. The one place alpha is
  legitimate is over the gradient, and nothing paints there.

### D.7 Fonts — a blocking finding

The mockup loads **IBM Plex Sans** and **IBM Plex Mono** from `fonts.googleapis.com`.

- `apps/web` has **no `@font-face` rule and no font file in `public/`**. The current stack starts
  `'Inter'`, which is not shipped either, so the product's face is currently whatever the reader's
  machine has.
- The deployed web origin's **Content-Security-Policy has no external origins at all**. A
  `<link rel="stylesheet" href="https://fonts.googleapis.com/…">` is blocked in production and the
  app silently falls back to `system-ui`. The design would be judged in a face it was not drawn
  in, in production only, with a green CI.

**Resolution (in scope, `apps/web` + one compose variable):** self-host. Put the two families'
woff2 subsets in `apps/web/public/fonts/`, declare `@font-face` in `globals.css` with
`font-display: swap`, and add `font-src 'self'` to the CSP in `docker-compose.yml` (an operator
variable, not an `apps/api` change). Raise it now: the CSP edit needs the product owner because it
touches deployment.

There is a second, smaller conflict: a recent decision names **Space Grotesk** as the product's
typeface. The mockup says IBM Plex. The mockup is authoritative for this epic; record that the
earlier choice is superseded rather than leaving two files disagreeing.

---

## E. The identity line

### E.1 Contents, in DOM order

```
[brand mark ▸ app menu] [project / plan crumb · status pill · ▾] ←flex→
   [MODE] [Diagram│Gantt] [Early│Visual] │ [pen status] [Start editing]
```

### E.2 The layout contract

```
.identity   display:flex; align-items:center; gap:11px; flex:none; container-type:inline-size
  every child        shrink-0
  the crumb block    min-w-0 flex-1 truncate     ← the ONLY flexible child
```

**Nothing reads a width.** No `ResizeObserver`, no `clientWidth`, no band context, no ladder, no
hysteresis, no constant. The stated constraint — _a band's own width must never be an input to a
fit decision_ — is met because there is no fit decision. This is the mechanism that produced the
repository's repeated failures (a row measuring its own leftover width, a chip beside a toolbar
silently costing four commands their labels, a merged band dropping below every floor), and it is
removed rather than corrected.

### E.3 Degradation as width falls — declared, not measured

A CSS **container query** ladder on the identity line, expressed as breakpoints in the stylesheet,
in a fixed priority order. Container queries rather than media queries because the identity line's
width is the shell's width today but need not be tomorrow; the tooling is already present
(`FieldGrid` uses them).

| below         | what gives way                                                              | why it is the right thing to lose                                                                                                                      |
| ------------- | --------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------ |
| —             | the crumb's **project** segment truncates with `…`, `title` intact          | it is text a reader can still get at                                                                                                                   |
| ~1100         | the crumb's project segment is hidden entirely                              | the Explorer beside it names the hierarchy                                                                                                             |
| ~1000         | the **MODE** caption drops                                                  | the two segments are self-describing; the caption is an aid                                                                                            |
| ~880          | the pen sentence ("No one is editing") becomes an icon with an `aria-label` | the **Start editing** button still carries the word                                                                                                    |
| `< lg` (1024) | the line **wraps to two rows** (`flex-wrap: wrap`)                          | wrapping is the same honest answer the deck gives; it costs a row of height on a viewport that is not the design's target and it never hides a control |

**The two mode segments never truncate, never lose their labels and never move.** They are
`shrink-0` and labelled at every width. That is the one hard rule on this line, and it is the
reason the mode controls left the command surface: a mode behind an overflow menu is a dead end.

### E.4 The numbers — estimated here, must be measured before merge

The product owner's machine is **1646 CSS px**. Estimated fixed-width content:

```
brand mark            32
crumb (min)          160   (flexible; this is its floor)
MODE caption          34
Diagram│Gantt        ~176
Early│Visual         ~152
rule                   1
pen status           ~150
Start editing        ~110
gaps (8 × 11)         88
padding               22
                    ─────
                    ~925 px fixed  →  ~721 px of slack at 1646
```

**These are estimates and the brief's measurement discipline applies.** Five consecutive width
expectations in this repository have been contradicted by their own measurement, and this document
is not a sixth. `apps/web/scripts/measure-workspace.mjs` must report the real boxes at **1646,
1440, 1280, 1024 and 768** before this ships, and the container-query breakpoints above must be
set from that output rather than from this table. The estimate exists to say the design is
plausible, not to say it fits.

### E.5 The segmented control

New primitive: `components/ui/segmented-control.tsx`.

- `role="radiogroup"` with `role="radio" aria-checked` children, `aria-labelledby` the MODE
  caption. This is the APG pattern for a mutually-exclusive choice.
  **Cost, stated:** the four existing items use `aria-pressed` toggle buttons, so ~8 assertions in
  the toolbar suites change. Those suites are being rewritten anyway (the brief expects it), and
  `aria-pressed` on a group of mutually-exclusive buttons is the weaker semantic — it says
  "pressed", not "this one of two".
- One tab stop for the group; `ArrowLeft`/`ArrowRight` move and select.
- The four registry items keep their `isEnabled` / `disabledReason` / `isActive` predicates —
  `mode-early`/`mode-visual` carry the pen refusal sentence, which is real logic worth keeping.
  They are `surface: 'identity'` and rendered by `ModeSegments`, which reads the same registry
  through `resolveItems` and hands each pair to a `SegmentedControl`. They do **not** go through
  the deck renderer.

### E.6 The brand-mark app menu

The six organisation destinations move behind the brand mark, using the existing `Menu` primitive
(`components/ui/menu.tsx`) — which correctly keeps `aria-disabled` items focusable so their reason
is reachable.

Reuse `org-destinations.tsx`'s `DESTINATIONS` array; do not restate it. That file's own docblock
already says "one array rendered two ways" — the two collapsed/expanded renderers are deleted and
one menu renderer replaces them, so it becomes one array rendered one way.

Below `lg` the menu gains a **"Project Explorer"** item that opens the off-canvas `Sheet`. That is
what lets `app-header.tsx` be deleted outright: its only remaining job was carrying that trigger.

---

## F. Component inventory

### F.1 New

```
apps/web/src/components/ui/deck/CommandDeck.tsx
apps/web/src/components/ui/deck/DeckGroup.tsx
apps/web/src/components/ui/deck/DeckButton.tsx
apps/web/src/components/ui/deck/deck-styles.ts               CVA: stacked button, group card, caption, rule
apps/web/src/components/ui/deck/use-deck-group-prefs.ts
apps/web/src/components/ui/deck/index.ts
apps/web/src/components/ui/segmented-control.tsx

apps/web/src/components/layout/app-menu.tsx                  brand-mark menu (org destinations)
apps/web/src/components/layout/explorer/explorer-dock.tsx    panel + resizer + spine, shell-owned
apps/web/src/components/layout/explorer/explorer-spine.tsx
apps/web/src/components/layout/explorer/use-explorer-prefs.ts
apps/web/src/components/layout/status/schedule-state.tsx     current | settling | stale | stale-unknown

apps/web/src/components/layout/workspace/plan-identity-line.tsx
apps/web/src/components/layout/workspace/mode-segments.tsx

apps/web/src/features/schedule/model/plan-staleness.ts       pure reducer
apps/web/src/features/schedule/model/use-plan-staleness.tsx  provider + useReportScheduleEdit

apps/web/e2e-deck/                                           replaces e2e-toolbar-fit
apps/web/playwright.deck.config.ts
apps/web/scripts/measure-workspace.mjs                       replaces measure-toolbar
```

### F.2 Modified

```
apps/web/src/components/ui/toolbar/toolbar-registry.ts
    − ToolbarTier, ToolbarLayoutMode, TOOLBAR_LAYOUT_BANDS, TOOLBAR_LAYOUT_HYSTERESIS_PX,
      resolveLayoutMode, bandIsAtLeast, ToolbarLabelPolicy, ToolbarLayoutEnv,
      partitionByTier, priorityOf, ToolbarRow, splitByRow
    + DeckGroupId, DECK_GROUP_OF, splitBySurface
    ~ ToolbarItem: − tier, priority, showLabel, demotionGroup, presentational, row
                   + iconOnly?, dividerBefore?, surface?
    ~ defineToolbar: − both demotionGroup guards
    ~ resolveItems:  − the `layout` parameter and the `env` argument to isVisible
    ~ ToolbarItemRenderApi: − layout

apps/web/src/features/tsld/toolbar/tsld-toolbar-items.tsx
    ~ mechanical field removal at ~40 sites (the compiler is the checklist)
    ~ dividerBefore at 5 places (View/lens, Author×2, Plan/output, and Find if wanted)
    ~ next-conflict absorbs next-conflict-status as a fixed-width count in its label
    − next-conflict-status (presentational)
    ~ mode-early / mode-visual / view-tsld / view-gantt → surface: 'identity'
    + a `pan` tool item                                  ← see §9, this does not exist today
    ~ recalculate: removed from the deck entirely (it lives in the status bar now)
    ~ ToolbarPopover / ToolbarSplitButton triggers keep working; restyle only

apps/web/src/components/ui/toolbar/ToolbarPopover.tsx        − the `compact` prop (was layout-driven)
apps/web/src/components/ui/toolbar/ToolbarSplitButton.tsx    restyle to the stacked button
apps/web/src/components/ui/toolbar/toolbar-styles.ts         stacked variant; drop the band/coarse density branch

apps/web/src/components/layout/navigator/app-shell.tsx       the grid (§0); − drawer, − rail, + explorer column
apps/web/src/components/layout/chrome/chrome-band.tsx        − AppHeaderRow, − rail slot; slots: rows, status
apps/web/src/components/layout/chrome/chrome-slot.tsx        slot names: 'rows' | 'status'
apps/web/src/components/layout/navigator/navigator-rail.tsx  unchanged internally; new host
apps/web/src/components/layout/navigator/org-destinations.tsx  − two renderers, + menu renderer, keep the array
apps/web/src/components/layout/status/plan-status-bar.tsx    + <ScheduleState>; − the bare recalculating span
apps/web/src/components/layout/workspace/plan-workspace-toolbar.tsx
                                                             portals: identity + deck into "rows", status into "status"
apps/web/src/features/schedule/api/use-plan-auto-recalc.ts   + isSettling, + lastRunFailed
apps/web/src/features/activities/api/use-activities.ts       + reportScheduleEdit() in onSuccess
apps/web/src/features/dependencies/api/*.ts                  + reportScheduleEdit() in onSuccess
apps/web/src/features/tsld/render/paint.ts                   weekend flat tint, lane hairlines (no striping), arrowheads, driving weight
apps/web/src/styles/globals.css                              the four scopes' values, radii scale, two type members, @font-face
apps/web/src/lib/query/query-client.ts                       unchanged — noted only because C.5 depends on refetchOnWindowFocus
```

### F.3 Deleted

```
apps/web/src/components/ui/toolbar/Toolbar.tsx                     + Toolbar.test.tsx
apps/web/src/components/ui/toolbar/ToolbarOverflow.tsx             + ToolbarOverflow.test.tsx
apps/web/src/components/ui/toolbar/toolbar-ladder.ts               + toolbar-ladder.test.ts
apps/web/src/components/ui/toolbar/toolbar-band.tsx
apps/web/src/components/ui/toolbar/ToolbarButton.tsx               superseded by DeckButton

apps/web/src/components/layout/navigator/tool-rail.tsx             + tool-rail.test.tsx
apps/web/src/components/layout/app-header.tsx                      + app-header.test.tsx
apps/web/src/components/layout/drawer/context-drawer.tsx           + context-drawer.test.tsx
apps/web/src/components/layout/drawer/drawer-subject.tsx           + drawer-subject.test.tsx
apps/web/src/components/layout/drawer/use-context-drawer-prefs.ts
apps/web/src/components/layout/navigator/drawer-entry-point.test.tsx
apps/web/src/components/layout/workspace/workspace-view-toggle.tsx  (if the modes cover it — verify)

apps/web/e2e-toolbar-fit/                                          + playwright.toolbar-fit.config.ts
apps/web/scripts/measure-toolbar*.mjs                              + playwright.measure-toolbar.config.ts
```

**The drawer goes wholesale**, and the reason is not this redesign: `registerDrawerSubject` has
had **no production registrant** since the activity editor returned to a modal. The Explorer was
its only remaining content and it moves to the leading edge. Deleting it removes the shell's
Escape rung, the `showingContext`/`canShow` providers and the `drawerVisible`/`drawerHasContent`
derivation. Note that `drawer-entry-point.test.tsx` mounts a **synthetic probe route** and has
therefore never proved that anything registers a subject — it goes with the mechanism.

---

## G. Gates: which break, and what replaces them

| gate                                                                           | verdict                                                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| ------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `e2e-toolbar-fit` (S1–S11)                                                     | **Delete.** It tests the ladder.                                                                                                                                                                                                                                                                                                                                                                                                                                          |
| **replacement: `e2e-deck`**                                                    | Every command returned by `resolveItems` for a fully-loaded plan is (a) in the DOM, (b) has a non-zero box, and (c) is the topmost element at its own centre (`elementFromPoint`) — swept at 1646, 1440, 1280, 1024, 768. **Strictly stronger than the ladder gate**, and it is the gate the "no overflow menu" promise actually needs. A 0-px-wide control has no overhang and is still in the DOM, which is why the reachability probe rather than an arithmetic check. |
| `token-contrast.test.ts`                                                       | **Keep, re-derive.** It will fail on several approved values — see §9. Failures become a short exception list carrying the **measured ratio in the assertion**, so the number stays visible rather than the assertion being deleted.                                                                                                                                                                                                                                      |
| `token-architecture.test.ts` (closure, theme contract, sizing/weight ratchets) | **Keep.** The 9.5/8.5 px sizes are handled by adding ramp members (D.5), not by an exemption. Re-measure the ratchet ceilings after the deck lands; a ratchet raised whenever something new arrives is a counter.                                                                                                                                                                                                                                                         |
| `surface-seams.structural.test.ts`                                             | **Keep.** Still four scopes plus two theme-invariant ones; `<Surface>` is still the only route in.                                                                                                                                                                                                                                                                                                                                                                        |
| `reset-fills.structural.test.ts`                                               | **Keep.** `Card`/`Popover` still reset the page family.                                                                                                                                                                                                                                                                                                                                                                                                                   |
| `selection-duplication.structural.test.ts`                                     | **Keep — and it will fail.** See §9.                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| `host-parity.structural.test.ts`                                               | **Keep.** Unaffected.                                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| Playwright suites that locate a toolbar control by copy                        | ~10 will break. Rewrite them to locate by `[data-deck-item="<id>"]`, never by label — the register's own rule after three journeys broke on a label change.                                                                                                                                                                                                                                                                                                               |

---

## H. Risks

1. **A wrapping deck's height is data-dependent.** Four groups at 1646 measure two rows in the
   mockup; a narrower window or a longer label makes three. Every row costs the canvas ~46 px.
   Mitigation: per-group collapse is persistent and is the planner's lever, and the measurement
   harness reports deck height at all five widths. **This must be measured before merge**, because
   "the deck is two rows" is the load-bearing claim of the whole design.
2. **The staleness count under-reports if a write hook is added without reporting.** Mitigated by
   the structural test in C.3. Without that test this is the design's silent failure mode.
3. **`stale-unknown` copy.** If `PLAN_EDIT_LOCK_ENFORCED` is false, two planners edit at once and
   this state becomes ordinary. The sentence must never say "your edits".
4. **Focus loss on collapse** (Explorer, deck group, and the deck's own unmounts). Four recorded
   instances of this class in this codebase. Every collapse and every unmount in this epic names
   its focus destination, and the journey asserts it — a unit test cannot see the ordering.
5. **The CSP/font issue (D.7) is invisible in development.** The dev server has no CSP. If the
   fonts are not self-hosted, the design ships in the wrong typeface, in production only, with a
   green CI.
6. **Alpha values that are not resolved to solids** are invisible to the contrast matrix. The
   mockup has ~20 of them.

---

## I. Contradictions found in the existing code

These are things the approved design collides with. Each needs a decision; none is a reason to
change the design without the product owner.

1. **`Isolate` and `Logic` in the deck's Find group are already object actions on the canvas
   dock**, and `selection-duplication.structural.test.ts` exists specifically to fail when a
   selection-gated command appears on **both** the command surface and the dock. `isolate-logic`
   and `zoom-to-selection` were deliberately moved off the command surface for that reason.
   - **Recommended:** `Isolate` stays a dock action only — the mockup loses that one button.
     `Logic` (the `net` icon) is re-read as the plan-wide **"show all logic links"** toggle, which
     already exists as `canvasUi.viewToggles.logicLinks` and is not selection-gated. That
     interpretation removes the conflict _and_ is a better fit for a `find`-group toggle.
   - Alternative: amend the gate's roster. Do not do this silently — the gate was written after the
     duplication shipped and was found by three people separately.
   - `Float paths` is fine: it is selection-gated but has no dock twin today.

2. **There is no `Pan` tool.** `EditMode` is `'select' | 'add-activity' | 'link' | 'loe' |
'marquee'`; panning is implicit in `select` (a drag on empty space pans, a click selects, with a
   movement threshold telling them apart). The mockup's Author group has both **Select** and
   **Pan** as separate buttons. Building `Pan` means a sixth `EditMode`, a cursor change, a
   pointer-down branch that pans regardless of what is under it, and an Escape rung. It is real
   work, not a registration. Decide whether it is in this epic.

3. **`Recalculate` has a `priority: 95` and a long docblock explaining it**, and both become
   meaningless. The command leaves the deck for the status bar and the field is deleted. Remove the
   docblock rather than leaving a justification for a field that no longer exists.

4. **`ADR-0056`'s zoom presets live in `View ▾`**, but the mockup's View group has Zoom−, Zoom+ and
   Fit as top-level `.nolab` buttons. Both can be true (the presets stay in the popover, the three
   viewport commands are inline), and that is what the mockup shows — but check that `View ▾`'s
   own `Zoom` section is not now a duplicate of three buttons sitting 40 px to its left.

5. **`use-plan-auto-recalc.ts`'s `enabled` gate is
   `CANVAS_AUTHORING_ENABLED && canRecalc && plan.plannedStart != null`.** With no data date, no
   recalculation ever fires and the plan is permanently stale with nothing saying so. The new
   status bar surfaces it for the first time — which is a benefit, but the copy needs a third
   sentence for "this plan has no data date", or the reader will press Recalculate and get a
   refusal.

6. **The mockup's `--c-norm` (#4B7FC4) carries a white bar label at ≈3.3:1.** Below AA for text.
   The design's own `--c-norm-edge` (#31598F) is ≈6.0:1. Per the brief this is a cost to flag
   rather than a design to bend: either darken the fill to the edge value, or take dark ink on the
   light fill (the existing criticality ladder already does exactly that for its lightest member,
   for exactly this reason). Product-owner call.

7. **The type ramp and `--radius` scale do not exist as scales**, so the mockup's geometry has
   nowhere to live except literals — which the sizing ratchet rejects. D.5 is the fix and it is
   additive, but it is work nobody costed.

---

## J. Implementer checklist

1. Measure the _before_ state at 1646 with `scripts/measure-workspace.mjs` and record it. Every
   later claim compares against this file, not against this document.
2. Land the token layer first (D): four scopes' values, radii scale, two type-ramp members,
   self-hosted fonts + the CSP variable. Re-run the contrast matrix and record the exception list
   with measured ratios. Nothing visual is correct until this is in.
3. Narrow `ToolbarItem` (A.2/A.3). The compiler lists every site. Do not leave a field inert.
4. Build `CommandDeck` + `DeckGroup` + `DeckButton` and swap the renderer. Verify: no
   `ResizeObserver`, no `clientWidth`, no `getComputedStyle` for measurement anywhere in
   `components/ui/deck/`. Grep for it.
5. Re-shape the shell grid (§0), move the Explorer to the leading column on `PanelResizer` +
   `useResizablePanelPrefs`, delete the drawer and the rail. Assert focus destinations on collapse
   and expand.
6. Identity line + `SegmentedControl` + app menu. **Measure at 1646/1440/1280/1024/768 and set the
   container-query breakpoints from the output**, not from §E.4's estimates.
7. Staleness: pure reducer first with its own unit tests over all ten boundaries in C.5; then the
   provider; then the reporting hooks; then the structural test that every write hook reports;
   then the status-bar surface last.
8. Canvas paint changes (flat weekend tint, lane hairlines, lightness-separated criticality, real
   arrowheads, driving weight) — values and stroke only; the geometry, hit-testing and the a11y
   listbox do not change.
9. Write `e2e-deck` and delete `e2e-toolbar-fit`. Rewrite every broken journey to locate by
   `[data-deck-item]`, not by copy.
10. Run every Playwright suite, not only the one CI names. A label or layout change has broken
    three journeys at once in this repository before, and CI reported one of them.
11. Screenshot the workspace at 1646 — the plan workspace was missing from the shot list until
    recently, which is how a four-scrollbar panel reached a user.
