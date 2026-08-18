import { Dialog } from '@/components/ui/dialog';
import type { PlanViewMode } from '@/features/gantt/view-mode';
import {
  CANVAS_DIRECT_MANIPULATION_ENABLED,
  CANVAS_MULTI_SELECT_ENABLED,
  CANVAS_SEARCH_NAV_ENABLED,
  UNDO_REDO_ENABLED,
} from '@/config/env';

interface Shortcut {
  keys: string;
  action: string;
}

const READ_SHORTCUTS: readonly Shortcut[] = [
  { keys: '↑ / ↓', action: 'Previous / next activity' },
  { keys: 'Home / End', action: 'First / last activity' },
  { keys: '[ / ]', action: 'Jump to the driving predecessor / successor (then trace the path)' },
  ...(CANVAS_MULTI_SELECT_ENABLED
    ? []
    : [
        {
          keys: 'Space',
          action: 'Announce logic ties and driving detail for the focused activity',
        },
      ]),
  { keys: 'Enter', action: 'Open the logic (dependency) editor' },
  { keys: '?', action: 'Show this shortcuts help' },
  { keys: 'Esc', action: 'Cancel the current gesture / close a popover' },
];

/**
 * Multi-select bindings (`docs/specs/canvas-multi-select/` M3-T1) — **Space is rebound**, so its
 * old entry is removed above rather than duplicated. A sheet that lists Space twice, doing two
 * different things, is worse than one that lists neither.
 */
const MULTI_SELECT_SHORTCUTS: readonly Shortcut[] = [
  { keys: 'Space', action: 'Add / remove the focused activity from the selection' },
  { keys: 'i', action: 'Announce logic ties and driving detail for the focused activity' },
  { keys: 'Shift + ↑ / ↓', action: 'Extend the selection to the previous / next activity' },
  { keys: 'Cmd / Ctrl + A', action: 'Select every activity' },
  { keys: 'Esc', action: 'Clear the selection (after closing any armed tool)' },
];

const EDIT_SHORTCUTS: readonly Shortcut[] = [
  { keys: 'Alt + ↑ / ↓', action: 'Move the activity up / down one lane' },
  { keys: 'Alt + ← / →', action: 'Nudge the start one day earlier / later (recalculates)' },
  {
    keys: 'n',
    action: 'Create an activity in the focused lane and start (uses the armed Add type)',
  },
];

/**
 * Direct-manipulation accelerators (ADR-0052 M2) — appended to the Edit list only when
 * `VITE_CANVAS_DIRECT_MANIPULATION` is on, so the sheet stays byte-for-byte identical flag-off.
 * No collision: plain `←/→` are unused in the listbox and the start-day nudge is `Alt`-chorded.
 */
const DIRECT_MANIPULATION_SHORTCUTS: readonly Shortcut[] = [
  { keys: 'Shift + ← / →', action: 'Shorten / lengthen the duration one day (recalculates)' },
];

/**
 * Search-navigation accelerators (`docs/specs/canvas-search-navigation/` M2-T3) — appended only when
 * `VITE_CANVAS_SEARCH_NAV` is on, so the sheet stays byte-for-byte identical with the flag off.
 * These are the only shortcuts in the sheet that act on a **focused field** rather than the canvas,
 * which is why they say so: a planner reading the list needs to know where to press them.
 */
const SEARCH_NAV_SHORTCUTS: readonly Shortcut[] = [
  { keys: 'Enter (in Search)', action: 'Go to the next matching activity' },
  { keys: 'Shift + Enter (in Search)', action: 'Go to the previous matching activity' },
];

/**
 * Undo/redo accelerators (ADR-0048 M3.2) — appended to the Edit list only when `VITE_UNDO_REDO` is on,
 * so the sheet stays byte-for-byte identical with the flag off.
 */
const UNDO_REDO_SHORTCUTS: readonly Shortcut[] = [
  { keys: 'Cmd / Ctrl + Z', action: 'Undo the last edit' },
  { keys: 'Cmd / Ctrl + Shift + Z  ·  Ctrl + Y', action: 'Redo' },
];

/**
 * **The Gantt's own bindings** (`docs/TECH_DEBT.md` #137).
 *
 * ADR-0095 gave that view F2, Enter, Escape, Tab-to-commit, `Alt+←/→` and `Shift+←/→`, and there
 * was **nowhere documenting them**: this sheet was mounted inside `TsldPanel`, which the Gantt does
 * not render, so the `?` binding and the account-menu item set a state nothing drew. The M6 ux gate
 * found the dead control and deliberately did not patch it, because opening a sheet of CANVAS
 * bindings in the Gantt answers the wrong question. This is the other half.
 *
 * Deliberately NOT merged into one list. The two views share key NAMES and not meanings — `Enter`
 * opens the logic editor on the canvas and commits a cell edit here — so a combined sheet would
 * have to qualify half its rows with "(in the diagram)", which is a sheet nobody finishes reading.
 */
const GANTT_READ_SHORTCUTS: readonly Shortcut[] = [
  { keys: '↑ / ↓', action: 'Previous / next row' },
  { keys: 'Home / End', action: 'First / last row' },
  { keys: '← / →', action: 'Collapse / expand a summary row' },
  { keys: '?', action: 'Show this shortcuts help' },
];

const GANTT_EDIT_SHORTCUTS: readonly Shortcut[] = [
  { keys: 'F2  ·  double-click', action: 'Edit the focused cell (Activity or Duration)' },
  { keys: 'Enter', action: 'Commit the cell edit' },
  { keys: 'Tab', action: 'Commit and move to the next cell' },
  { keys: 'Esc', action: 'Discard the cell edit' },
  { keys: 'Alt + ← / →', action: 'Move the bar one day earlier / later (recalculates)' },
  { keys: 'Shift + ← / →', action: 'Shorten / lengthen the bar one day (recalculates)' },
];

function ShortcutList({ items }: { items: readonly Shortcut[] }): React.ReactElement {
  return (
    <dl className="grid grid-cols-[max-content_1fr] gap-x-4 gap-y-2 text-sm">
      {items.map((s) => (
        <div key={s.keys} className="contents">
          <dt className="text-muted-foreground font-mono whitespace-nowrap">{s.keys}</dt>
          <dd>{s.action}</dd>
        </div>
      ))}
    </dl>
  );
}

/**
 * The TSLD keyboard-shortcuts reference (M5), opened with `?` from the diagram's activity list.
 * Read shortcuts always show; edit shortcuts appear only when on-canvas editing is enabled. Built
 * on the shared {@link Dialog} (native focus trap + Escape), so it's keyboard-operable by default.
 */
export function PlanShortcutsHelp({
  open,
  onClose,
  editingEnabled,
  view = 'tsld',
}: {
  open: boolean;
  onClose: () => void;
  editingEnabled: boolean;
  /**
   * Which projection the planner is looking at. Defaults to the diagram, so every existing caller
   * is unchanged — and so a host that forgets to pass it shows the canvas sheet rather than an
   * empty one.
   */
  view?: PlanViewMode;
}): React.ReactElement {
  if (view === 'gantt') {
    return (
      <Dialog
        open={open}
        onClose={onClose}
        title="Gantt keyboard shortcuts"
        description="Focus a row in the chart, then use these keys to navigate and edit."
      >
        <div className="flex flex-col gap-5">
          <section className="flex flex-col gap-2">
            <h3 className="text-sm font-semibold">Navigate</h3>
            <ShortcutList items={GANTT_READ_SHORTCUTS} />
          </section>
          {editingEnabled ? (
            <section className="flex flex-col gap-2">
              <h3 className="text-sm font-semibold">Edit</h3>
              <ShortcutList items={GANTT_EDIT_SHORTCUTS} />
            </section>
          ) : null}
        </div>
      </Dialog>
    );
  }
  const editShortcuts = [
    ...EDIT_SHORTCUTS,
    ...(CANVAS_DIRECT_MANIPULATION_ENABLED ? DIRECT_MANIPULATION_SHORTCUTS : []),
    ...(CANVAS_SEARCH_NAV_ENABLED ? SEARCH_NAV_SHORTCUTS : []),
    ...(UNDO_REDO_ENABLED ? UNDO_REDO_SHORTCUTS : []),
  ];
  return (
    <Dialog
      open={open}
      onClose={onClose}
      title="Diagram keyboard shortcuts"
      description="Focus the activity list, then use these keys to navigate and edit."
    >
      <div className="flex flex-col gap-5">
        <section className="flex flex-col gap-2">
          <h3 className="text-sm font-semibold">Navigate</h3>
          <ShortcutList items={READ_SHORTCUTS} />
        </section>
        {CANVAS_MULTI_SELECT_ENABLED ? (
          <section className="flex flex-col gap-2">
            <h3 className="text-sm font-semibold">Select</h3>
            <ShortcutList items={MULTI_SELECT_SHORTCUTS} />
            {/*
              **What a selection unlocks** (ADR-0090 M5, discharging the M2-T1 obligation).

              M2-T1 moved `Zoom to selection` and `Isolate logic path` from Row 1 to the selection
              bar, and the plan recorded the cost in its own words: *"Afterwards they are absent
              until a bar is selected, and nothing announces that they exist… M3 must check that
              discoverability is not what got optimised away."* M3 did not check it; the M5 ux gate
              found the obligation still open.

              **Omitting them is right** — ADR-0082's discriminator says omit when the action does
              not apply to the object, and "zoom to the selection" does not apply with nothing
              selected. What was lost is not the control but the **teaching**: the shaded state used
              to state the precondition. So the teaching moves here, to the sheet a planner opens to
              learn the canvas, instead of buying it back with pinned width on every plan.

              A sentence rather than `ShortcutList` rows, because these have no keystroke and a
              key column with nothing in it reads as a binding nobody can remember.
            */}
            <p className="text-muted-foreground text-sm">
              Selecting an activity reveals its own action bar on the canvas — including{' '}
              <strong className="text-foreground font-medium">Zoom to selection</strong> and{' '}
              <strong className="text-foreground font-medium">Isolate logic path</strong>, which act
              on what you have selected.
            </p>
          </section>
        ) : null}
        {editingEnabled ? (
          <section className="flex flex-col gap-2">
            <h3 className="text-sm font-semibold">Edit</h3>
            <ShortcutList items={editShortcuts} />
          </section>
        ) : null}
      </div>
    </Dialog>
  );
}
