import { Check, ChevronDown } from 'lucide-react';
import { useId } from 'react';

import { Button } from '@/components/ui/button';
import { Menu, MenuItem, useMenuTrigger } from '@/components/ui/menu';
import { useTooltip } from '@/components/ui/tooltip';
import {
  CODE_COLUMN_CAP_REASON,
  MAX_CODE_COLUMNS,
  type CodeColumnsChoice,
} from '@/lib/code-columns';
import { cn } from '@/lib/utils';

/** Why the button is shaded when the plan has no types to show. */
export const NO_CODE_TYPES_REASON = 'This plan has no codes yet. Add them with Codes…';
const LOADING_REASON = 'Codes are loading.';
const FAILED_REASON = 'Codes could not be loaded.';

function shutReason(choice: CodeColumnsChoice): string | null {
  if (choice.status === 'loading') return LOADING_REASON;
  if (choice.status === 'error') return FAILED_REASON;
  return choice.types.length === 0 ? NO_CODE_TYPES_REASON : null;
}

/**
 * **Columns** — the Activities table's chooser for code columns (`m3-ui-design.md` §5.2): one
 * `menuitemcheckbox` per live type in type order, labelled by the type's name.
 *
 * Shaded rather than hidden when there is nothing to choose (ADR-0204): `aria-disabled` keeps it in the
 * tab order and the reason is its description, with a tip for a pointer or a finger. At the cap the
 * unchecked items are shaded with their reason and stay focusable (ADR-0082); a checked item is never
 * shaded, so a column can always be switched off.
 */
export function CodeColumnsMenu({ choice }: { choice: CodeColumnsChoice }): React.ReactElement {
  const { triggerRef, open, anchor, close, toggle } = useMenuTrigger();
  const reasonId = useId();
  const reason = shutReason(choice);
  const shut = reason !== null;
  const tip = useTooltip({ content: reason ?? undefined, purpose: 'reason-echo' });
  const { ref: tipRef, ...tipTrigger } = tip.triggerProps;
  const atCap = choice.shownIds.length >= MAX_CODE_COLUMNS;

  return (
    <>
      <Button
        {...tipTrigger}
        ref={(node) => {
          tipRef(node);
          triggerRef.current = node;
        }}
        type="button"
        variant="outline"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-disabled={shut || undefined}
        {...(shut ? { 'aria-describedby': reasonId } : {})}
        onClick={() => {
          if (!shut) toggle();
        }}
      >
        Columns
        <ChevronDown aria-hidden="true" className="size-4" />
      </Button>
      {tip.tooltip}
      {shut ? (
        <span id={reasonId} className="sr-only">
          {reason}
        </span>
      ) : null}
      {open && !shut ? (
        <Menu
          open
          onClose={close}
          anchor={anchor}
          label="Code columns"
          openerRef={triggerRef}
          restoreFocusRef={triggerRef}
        >
          {choice.types.map((type) => {
            const checked = choice.shownIds.includes(type.id);
            const capped = atCap && !checked;
            return (
              <MenuItem
                key={type.id}
                checked={checked}
                disabled={capped}
                {...(capped ? { disabledReason: CODE_COLUMN_CAP_REASON } : {})}
                onSelect={() =>
                  choice.setShown(
                    checked
                      ? choice.shownIds.filter((id) => id !== type.id)
                      : [...choice.shownIds, type.id],
                  )
                }
              >
                <Check
                  aria-hidden="true"
                  className={cn('size-4', checked ? 'opacity-100' : 'opacity-0')}
                />
                {type.name}
              </MenuItem>
            );
          })}
        </Menu>
      ) : null}
    </>
  );
}
