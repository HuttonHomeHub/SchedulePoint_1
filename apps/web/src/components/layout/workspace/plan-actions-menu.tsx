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
        {model.canWrite ? (
          <MenuItem onSelect={() => model.setEditing(true)}>
            <SquarePen aria-hidden="true" className="size-4" /> Edit plan…
          </MenuItem>
        ) : null}
        <MenuItem onSelect={() => setDialog('baselines')}>
          <Layers aria-hidden="true" className="size-4" /> Baselines…
        </MenuItem>
        <MenuItem onSelect={() => setDialog('calendar')}>
          <CalendarDays aria-hidden="true" className="size-4" /> Calendar…
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
