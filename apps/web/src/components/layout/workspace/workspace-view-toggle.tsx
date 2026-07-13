import { useRef } from 'react';

import { cn } from '@/lib/utils';

/** The single pane a narrow (below-`md`) workspace shows: the canvas diagram or the activities table. */
export type WorkspacePane = 'diagram' | 'activities';

/**
 * The mobile (below `md`) view switch shared by both plan-workspace layouts (ADR-0030 & ADR-0031):
 * a **`radiogroup`** choosing whether the single pane shows the **Diagram** (canvas) or the
 * **Activities** table — mutually-exclusive single-select, so radios (roving `tabindex`,
 * Arrow/Home/End) convey "one of a set" to AT better than toggle buttons. Rendered only below `md`,
 * where the vertical split can't give both surfaces useful height. Because the toggle *is* the
 * control the user acts on, focus stays on it across a switch (never stranded in the hidden pane).
 */
export function WorkspaceViewToggle({
  value,
  onChange,
}: {
  value: WorkspacePane;
  onChange: (value: WorkspacePane) => void;
}): React.ReactElement {
  const OPTIONS: { value: WorkspacePane; label: string }[] = [
    { value: 'diagram', label: 'Diagram' },
    { value: 'activities', label: 'Activities' },
  ];
  const refs = useRef<Partial<Record<WorkspacePane, HTMLButtonElement | null>>>({});
  const move = (next: WorkspacePane): void => {
    onChange(next);
    refs.current[next]?.focus();
  };
  const onKeyDown = (event: React.KeyboardEvent<HTMLButtonElement>): void => {
    const idx = OPTIONS.findIndex((o) => o.value === value);
    switch (event.key) {
      case 'ArrowRight':
      case 'ArrowDown':
        move(OPTIONS[(idx + 1) % OPTIONS.length]!.value);
        break;
      case 'ArrowLeft':
      case 'ArrowUp':
        move(OPTIONS[(idx - 1 + OPTIONS.length) % OPTIONS.length]!.value);
        break;
      case 'Home':
        move(OPTIONS[0]!.value);
        break;
      case 'End':
        move(OPTIONS[OPTIONS.length - 1]!.value);
        break;
      default:
        return;
    }
    event.preventDefault();
  };
  return (
    <div
      role="radiogroup"
      aria-label="Workspace view"
      className="border-border flex shrink-0 gap-1 border-b p-2"
    >
      {OPTIONS.map((option) => (
        <button
          key={option.value}
          ref={(el) => {
            refs.current[option.value] = el;
          }}
          type="button"
          role="radio"
          aria-checked={value === option.value}
          tabIndex={value === option.value ? 0 : -1}
          onClick={() => onChange(option.value)}
          onKeyDown={onKeyDown}
          className={cn(
            'focus-visible:ring-ring min-h-11 flex-1 rounded-md px-3 py-1.5 text-sm font-medium outline-none focus-visible:ring-2 focus-visible:ring-offset-2',
            value === option.value
              ? 'bg-accent text-accent-foreground'
              : 'text-muted-foreground hover:text-foreground',
          )}
        >
          {option.label}
        </button>
      ))}
    </div>
  );
}
