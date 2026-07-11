import { useEffect, useRef, useState } from 'react';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

export interface CreateActivityPopoverProps {
  /** Container-relative screen position (px) to anchor the popover at the dropped ghost. */
  x: number;
  y: number;
  saving: boolean;
  error: string | null;
  onCommit: (name: string) => void;
  onCancel: () => void;
}

/**
 * The inline name-capture popover for create-by-drag (M2 Slice 2.1, OQ1). It appears at the
 * dropped ghost so no unnamed junk row is ever persisted: `Enter` (submit) commits the name
 * and fires the create + recalc, `Esc` cancels with no write. While saving it disables and
 * echoes "Saving…"; a server error (validation/409) shows inline without losing the typed name.
 */
export function CreateActivityPopover({
  x,
  y,
  saving,
  error,
  onCommit,
  onCancel,
}: CreateActivityPopoverProps): React.ReactElement {
  const [name, setName] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);
  const trimmed = name.trim();

  // The popover opens on an explicit drop gesture; focus its sole input so typing the name
  // is immediate (done via a ref effect rather than autoFocus, per the a11y lint rule).
  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  return (
    <form
      aria-label="Name the new activity"
      style={{ left: x, top: y }}
      className="border-border bg-card absolute z-10 flex w-56 flex-col gap-2 rounded-lg border p-2 shadow-md"
      onSubmit={(event) => {
        event.preventDefault();
        if (trimmed) onCommit(trimmed);
      }}
    >
      <Input
        ref={inputRef}
        value={name}
        onChange={(event) => setName(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === 'Escape') {
            event.preventDefault();
            onCancel();
          }
        }}
        placeholder="Activity name"
        aria-label="New activity name"
        aria-invalid={error ? true : undefined}
        disabled={saving}
        className="h-9"
      />
      {error ? (
        <p role="alert" className="text-destructive-text text-xs">
          {error}
        </p>
      ) : null}
      <div className="flex justify-end gap-2">
        <Button type="button" variant="ghost" size="sm" onClick={onCancel} disabled={saving}>
          Cancel
        </Button>
        <Button type="submit" size="sm" disabled={saving || !trimmed} aria-busy={saving}>
          {saving ? 'Saving…' : 'Add'}
        </Button>
      </div>
    </form>
  );
}
