import type { ActivitySummary } from '@repo/types';
import { ChevronDown } from 'lucide-react';
import { useId, useRef } from 'react';

import { CodeAssignControl } from './CodeAssignControl';

import { Button } from '@/components/ui/button';
import { ArrowKeysStayInPanel } from '@/components/ui/toolbar/ArrowKeysStayInPanel';
import { PopoverCloseContext } from '@/components/ui/toolbar/popover-close';
import { usePopoverPanel } from '@/components/ui/toolbar/use-popover-panel';
import { useTooltip } from '@/components/ui/tooltip';
import type { Command } from '@/features/undo-redo';

export const SET_CODE_LABEL = 'Set code…';

/**
 * The diagram's plural selection bar's **Set code…**: a button that opens {@link CodeAssignControl}
 * in the same non-modal panel the toolbar's disclosures use — the `MoveToSwimlaneButton` contract,
 * which this follows rather than restating (the bar is not a roving toolbar, so the trigger is an
 * ordinary button). A set closes the panel and returns focus here (`PopoverCloseContext`).
 *
 * Without the right to write it is **shaded with its reason, not hidden** (ADR-0204): `aria-disabled`
 * keeps it in the tab order, the reason is its description, and a press does nothing.
 */
export function CodeAssignButton({
  orgSlug,
  planId,
  activities,
  gate,
  record,
}: {
  orgSlug: string;
  planId: string;
  activities: readonly ActivitySummary[];
  gate: { writable: boolean; reason: string | null };
  record?: ((command: Command) => void) | undefined;
}): React.ReactElement {
  const triggerRef = useRef<HTMLButtonElement>(null);
  const selectRef = useRef<HTMLSelectElement>(null);
  const reasonId = useId();
  const shut = !gate.writable;
  // The reason is already the button's permanent `sr-only` description, so the tip only echoes it.
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
        {SET_CODE_LABEL}
        <ChevronDown aria-hidden="true" className="size-4" />
      </Button>
      {tip.tooltip}
      {shut && gate.reason ? (
        <span id={reasonId} className="sr-only">
          {gate.reason}
        </span>
      ) : null}
      {panel(
        SET_CODE_LABEL,
        <PopoverCloseContext.Provider value={() => close(true)}>
          <ArrowKeysStayInPanel>
            <CodeAssignControl
              orgSlug={orgSlug}
              planId={planId}
              activities={activities}
              gate={gate}
              record={record}
              selectRef={selectRef}
            />
          </ArrowKeysStayInPanel>
        </PopoverCloseContext.Provider>,
      )}
    </>
  );
}
