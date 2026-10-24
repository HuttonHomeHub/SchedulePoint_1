import { ChevronDown } from 'lucide-react';
import { useRef } from 'react';

import { MOVE_TO_SWIMLANE_LABEL, type SwimlaneAssignment } from '../model/swimlane-assignment';

import { MoveToSwimlaneControl } from './MoveToSwimlaneControl';

import { Button } from '@/components/ui/button';
import { PopoverCloseContext } from '@/components/ui/toolbar/popover-close';
import { usePopoverPanel } from '@/components/ui/toolbar/use-popover-panel';

/**
 * The plural selection bar's **Move to swimlane…**: a button that opens the shared
 * {@link MoveToSwimlaneControl} in the same non-modal panel the toolbar's disclosures use, so the
 * single-bar item and this one behave alike (Escape and an outside press close it and return focus to
 * the button). The bar is not a roving toolbar, so the trigger is an ordinary button.
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
  const selectRef = useRef<HTMLSelectElement>(null);
  const { open, openPanel, close, panel } = usePopoverPanel({
    triggerRef,
    initialFocus: selectRef,
  });
  return (
    <>
      <Button
        ref={triggerRef}
        type="button"
        size="sm"
        variant="secondary"
        aria-haspopup="dialog"
        aria-expanded={open}
        onClick={() => (open ? close(false) : openPanel())}
      >
        {MOVE_TO_SWIMLANE_LABEL}
        <ChevronDown aria-hidden="true" className="size-4" />
      </Button>
      {panel(
        MOVE_TO_SWIMLANE_LABEL,
        <PopoverCloseContext.Provider value={() => close(true)}>
          <MoveToSwimlaneControl
            assignment={assignment}
            ids={ids}
            names={names}
            gate={gate}
            selectRef={selectRef}
          />
        </PopoverCloseContext.Provider>,
      )}
    </>
  );
}
