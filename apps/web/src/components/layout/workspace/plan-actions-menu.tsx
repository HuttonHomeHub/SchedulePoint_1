import {
  BarChart3,
  CalendarDays,
  DollarSign,
  Info,
  Layers,
  MoreHorizontal,
  SquarePen,
} from 'lucide-react';
import { useState } from 'react';

import { PlanChromeDialogs, type PlanChromeDialog } from './plan-chrome-dialogs';
import type { LoadedPlan, PlanWorkspaceModel } from './use-plan-workspace-model';

import { Button } from '@/components/ui/button';
import { Menu, MenuItem, useMenuTrigger } from '@/components/ui/menu';
import { EARNED_VALUE_ENABLED, RESOURCE_CURVES_ENABLED } from '@/config/env';

/**
 * The plan workspace's header **overflow menu** (ADR-0030, spec re-homing table): the
 * lower-frequency plan chrome — Plan details, Edit plan, Baselines, Calendar — consolidated
 * behind a "⋯" button so the header stays slim and canvas-first, replacing M1's interim
 * `<details>` disclosure. Uses the shared APG `Menu` primitive (via `useMenuTrigger`) and the shared
 * {@link PlanChromeDialogs} so its sub-panels can't drift from the toolbar layout's (TECH_DEBT #30b/#31b).
 * **Plan details** is a read surface available to every role, so a non-writer can still read the
 * plan's description/planned-start (the header only shows name + status).
 */
export function PlanActionsMenu({
  model,
  plan,
}: {
  model: PlanWorkspaceModel;
  plan: LoadedPlan;
}): React.ReactElement {
  const { triggerRef, open, anchor, close, toggle } = useMenuTrigger();
  const [dialog, setDialog] = useState<PlanChromeDialog | null>(null);

  return (
    <>
      <Button
        ref={triggerRef}
        variant="ghost"
        size="icon"
        aria-label="Plan actions"
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={toggle}
      >
        <MoreHorizontal aria-hidden="true" className="size-4" />
      </Button>

      <Menu
        open={open}
        onClose={close}
        anchor={anchor}
        label="Plan actions"
        restoreFocusRef={triggerRef}
      >
        <MenuItem onSelect={() => setDialog('details')}>
          <Info aria-hidden="true" className="size-4" /> Plan details…
        </MenuItem>
        {/* Shaded with a reason rather than omitted (ADR-0082/ADR-0083, `docs/TECH_DEBT.md` #114.2):
            the option exists, the reader simply may not take it, and hiding it makes the menu look
            different to different people with nothing saying why. The sentence can be stated
            **precisely** here and nowhere else in this menu, because `model.canWrite` is
            `canManageHierarchy(role)` — role only, never pen-gated (`use-plan-workspace-model.ts`
            says so at its declaration). So there is no pen case to get wrong, which is exactly the
            distinction #114 said was missing and the reason this one is no longer a guess. */}
        <MenuItem
          disabled={!model.canWrite}
          disabledReason="Your role cannot edit this plan’s details."
          onSelect={() => model.setEditing(true)}
        >
          <SquarePen aria-hidden="true" className="size-4" /> Edit plan…
        </MenuItem>
        <MenuItem onSelect={() => setDialog('baselines')}>
          <Layers aria-hidden="true" className="size-4" /> Baselines…
        </MenuItem>
        {/* Named for the whole dialog's scope, not just its first section — see the matching
            toolbar item's note (TECH_DEBT #60). The two entry points must read the same. */}
        <MenuItem onSelect={() => setDialog('calendar')}>
          <CalendarDays aria-hidden="true" className="size-4" /> Schedule settings…
        </MenuItem>
        {EARNED_VALUE_ENABLED ? (
          <MenuItem onSelect={() => setDialog('earned-value')}>
            <DollarSign aria-hidden="true" className="size-4" /> Earned value…
          </MenuItem>
        ) : null}
        {RESOURCE_CURVES_ENABLED ? (
          <MenuItem onSelect={() => setDialog('resource-histogram')}>
            <BarChart3 aria-hidden="true" className="size-4" /> Resource histogram…
          </MenuItem>
        ) : null}
      </Menu>

      <PlanChromeDialogs
        dialog={dialog}
        onClose={() => setDialog(null)}
        model={model}
        plan={plan}
      />
    </>
  );
}
