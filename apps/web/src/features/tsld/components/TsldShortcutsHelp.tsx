import { Dialog } from '@/components/ui/dialog';

interface Shortcut {
  keys: string;
  action: string;
}

const READ_SHORTCUTS: readonly Shortcut[] = [
  { keys: '↑ / ↓', action: 'Previous / next activity' },
  { keys: 'Home / End', action: 'First / last activity' },
  { keys: '[ / ]', action: 'Jump to the driving predecessor / successor (then trace the path)' },
  { keys: 'Space', action: 'Announce logic ties and driving detail for the focused activity' },
  { keys: 'Enter', action: 'Open the logic (dependency) editor' },
  { keys: '?', action: 'Show this shortcuts help' },
  { keys: 'Esc', action: 'Cancel the current gesture / close a popover' },
];

const EDIT_SHORTCUTS: readonly Shortcut[] = [
  { keys: 'Alt + ↑ / ↓', action: 'Move the activity up / down one lane' },
  { keys: 'Alt + ← / →', action: 'Nudge the start one day earlier / later (recalculates)' },
  { keys: 'n', action: 'Create an activity in the focused lane and start' },
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
export function TsldShortcutsHelp({
  open,
  onClose,
  editingEnabled,
}: {
  open: boolean;
  onClose: () => void;
  editingEnabled: boolean;
}): React.ReactElement {
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
        {editingEnabled ? (
          <section className="flex flex-col gap-2">
            <h3 className="text-sm font-semibold">Edit</h3>
            <ShortcutList items={EDIT_SHORTCUTS} />
          </section>
        ) : null}
      </div>
    </Dialog>
  );
}
