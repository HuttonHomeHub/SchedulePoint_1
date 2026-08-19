import type { CalendarSummary } from '@repo/types';
import { MoreHorizontal } from 'lucide-react';
import { useRef, useState } from 'react';

import { Button } from '@/components/ui/button';
import { Menu, MenuItem } from '@/components/ui/menu';

/**
 * A calendar row's **secondary** actions (ADR-0097 Landing F1).
 *
 * The row's primary action — `Edit` — stays in the open beside this trigger, and that split is the
 * whole point. This table carried up to five text buttons per row, and the count was the defect
 * rather than the markup: a planner edits a calendar almost every time they touch one of these
 * rows, and that action was competing with four rarer neighbours for the eye and for the column's
 * width.
 *
 * **This is deliberately not "the APG row menu the standard specifies".** `docs/UX_STANDARDS.md`
 * "Row / node actions" is written for **dense list and tree rows** — rows with nowhere to show
 * their actions — and reaches for a hover-revealed `⋯` precisely because such a row cannot afford a
 * visible column. This table has one, and its own comment already cited that standard as satisfied.
 * Moving every action behind a click would have traded the frequent interaction for the infrequent.
 *
 * **Shaded, never omitted, and the reason travels with the item** (ADR-0082). `Move to
 * organisation` applies only to a project calendar and only to someone who may manage the shared
 * library — so a reader without the right sees the option and learns what it needs, rather than
 * meeting a row that silently offers less than a colleague's. It is **omitted** for an organisation
 * calendar, because there the action does not apply to the object at all, which is the same ADR's
 * other half.
 */
export function CalendarRowMenu({
  calendar,
  canManageOrg,
  archived,
  onMoveToOrg,
  onToggleArchived,
  onDelete,
}: {
  calendar: CalendarSummary;
  canManageOrg: boolean;
  archived: boolean;
  onMoveToOrg: () => void;
  onToggleArchived: () => void;
  onDelete: () => void;
}): React.ReactElement {
  const [anchor, setAnchor] = useState<{ x: number; y: number } | null>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);

  return (
    <>
      <Button
        ref={triggerRef}
        variant="ghost"
        size="icon-sm"
        // The name carries the row's subject, because a table of these renders one per row and
        // "More actions" repeated forty times tells a screen-reader user nothing about which.
        aria-label={`More actions: ${calendar.name}`}
        aria-haspopup="menu"
        aria-expanded={anchor !== null}
        onClick={(event) => {
          const rect = event.currentTarget.getBoundingClientRect();
          setAnchor({ x: rect.left, y: rect.bottom });
        }}
      >
        <MoreHorizontal aria-hidden="true" className="size-4" />
      </Button>
      <Menu
        open={anchor !== null}
        onClose={() => setAnchor(null)}
        anchor={anchor ?? { x: 0, y: 0 }}
        label={`Actions for ${calendar.name}`}
        restoreFocusRef={triggerRef}
      >
        {calendar.scope === 'PROJECT' ? (
          <MenuItem
            onSelect={onMoveToOrg}
            disabled={!canManageOrg}
            {...(canManageOrg
              ? {}
              : {
                  disabledReason:
                    'Only an Org Admin or Planner can move a calendar into the shared library.',
                })}
          >
            Move to organisation
          </MenuItem>
        ) : null}
        <MenuItem onSelect={onToggleArchived}>{archived ? 'Unarchive' : 'Archive'}</MenuItem>
        <MenuItem destructive onSelect={onDelete}>
          Delete
        </MenuItem>
      </Menu>
    </>
  );
}
