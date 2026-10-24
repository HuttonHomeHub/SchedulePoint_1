import { ChevronDown } from 'lucide-react';
import { useId, useRef } from 'react';

import { MOVE_TO_SWIMLANE_LABEL, type SwimlaneAssignment } from '../model/swimlane-assignment';

import { MoveToSwimlaneControl } from './MoveToSwimlaneControl';

import { Button } from '@/components/ui/button';
import { ArrowKeysStayInPanel } from '@/components/ui/toolbar/ArrowKeysStayInPanel';
import { PopoverCloseContext } from '@/components/ui/toolbar/popover-close';
import { usePopoverPanel } from '@/components/ui/toolbar/use-popover-panel';
import { useTooltip } from '@/components/ui/tooltip';

/**
 * The plural selection bar's **Move to swimlane…**: a button that opens the shared
 * {@link MoveToSwimlaneControl} in the same non-modal panel the toolbar's disclosures use, so the
 * single-bar item and this one behave alike (Escape and an outside press close it and return focus to
 * the button). The bar is not a roving toolbar, so the trigger is an ordinary button.
 *
 * Without the right to write it is **shaded with its reason, not hidden** (ADR-0204): `aria-disabled`
 * keeps it in the tab order, the reason is its description, and the click does nothing. If the bar
 * ever adopts `Toolbar` this becomes a `ToolbarPopover` item like the single bar's, which already
 * carries all of that.
 */
export function MoveToSwimlaneButton({
  assignment,
  ids,
  names,
  gate,
}: {
  assignment: SwimlaneAssignment;
  ids: readonly string[];
  names: readonly string[];
  gate: { writable: boolean; reason: string | null };
}): React.ReactElement {
  const triggerRef = useRef<HTMLButtonElement>(null);
  const reasonId = useId();
  const shut = !gate.writable;
  const selectRef = useRef<HTMLSelectElement>(null);
  // The reason is already the button's permanent `sr-only` description, so the tip is a `reason-echo`
  // (visual only, nothing linked) and a native `title` — which a screen reader would read a second
  // time — is gone.
  const tip = useTooltip({
    content: shut && gate.reason ? gate.reason : undefined,
    purpose: 'reason-echo',
  });
  const { ref: tipRef, ...tipTrigger } = tip.triggerProps;
  const { open, openPanel, close, panel } = usePopoverPanel({
    triggerRef,
    initialFocus: selectRef,
  });
  return (
    <>
      <Button
        {...tipTrigger}
        ref={(node) => {
          tipRef(node);
          triggerRef.current = node;
        }}
        type="button"
        size="sm"
        variant="secondary"
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-disabled={shut || undefined}
        {...(shut && gate.reason ? { 'aria-describedby': reasonId } : {})}
        onClick={() => {
          if (shut) return;
          if (open) close(false);
          else openPanel();
        }}
      >
        {MOVE_TO_SWIMLANE_LABEL}
        <ChevronDown aria-hidden="true" className="size-4" />
      </Button>
      {tip.tooltip}
      {shut && gate.reason ? (
        <span id={reasonId} className="sr-only">
          {gate.reason}
        </span>
      ) : null}
      {panel(
        MOVE_TO_SWIMLANE_LABEL,
        <PopoverCloseContext.Provider value={() => close(true)}>
          <ArrowKeysStayInPanel>
            <MoveToSwimlaneControl
              assignment={assignment}
              ids={ids}
              names={names}
              gate={gate}
              selectRef={selectRef}
            />
          </ArrowKeysStayInPanel>
        </PopoverCloseContext.Provider>,
      )}
    </>
  );
}
