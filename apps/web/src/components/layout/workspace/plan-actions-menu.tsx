import { CalendarDays, Layers, MoreHorizontal, SquarePen } from 'lucide-react';
import { useRef, useState } from 'react';

import type { LoadedPlan, PlanWorkspaceModel } from './use-plan-workspace-model';

import { Button } from '@/components/ui/button';
import { Dialog } from '@/components/ui/dialog';
import { Menu, MenuItem } from '@/components/ui/menu';
import { BaselinesPanel } from '@/features/baselines';
import { PlanCalendarPicker } from '@/features/plans';

type PlanDialog = 'baselines' | 'calendar' | null;

/**
 * The plan workspace's header **overflow menu** (ADR-0030, spec re-homing table): the
 * lower-frequency plan chrome — Edit plan, Baselines, Calendar — consolidated behind a "⋯"
 * button so the header stays slim and canvas-first, replacing M1's interim `<details>`
 * disclosure. Uses the shared APG `Menu` primitive; Baselines and Calendar open in the shared
 * modal `Dialog` (the panels are unchanged, just re-homed).
 */
export function PlanActionsMenu({
  model,
  plan,
}: {
  model: PlanWorkspaceModel;
  plan: LoadedPlan;
}): React.ReactElement {
  const { orgSlug, planId } = model;
  const triggerRef = useRef<HTMLButtonElement>(null);
  const [open, setOpen] = useState(false);
  const [anchor, setAnchor] = useState({ x: 0, y: 0 });
  const [dialog, setDialog] = useState<PlanDialog>(null);

  const openMenu = (): void => {
    const rect = triggerRef.current?.getBoundingClientRect();
    setAnchor({ x: rect?.left ?? 0, y: rect?.bottom ?? 0 });
    setOpen(true);
  };

  return (
    <>
      <Button
        ref={triggerRef}
        variant="ghost"
        size="icon"
        aria-label="Plan actions"
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => (open ? setOpen(false) : openMenu())}
      >
        <MoreHorizontal aria-hidden="true" className="size-4" />
      </Button>

      <Menu
        open={open}
        onClose={() => setOpen(false)}
        anchor={anchor}
        label="Plan actions"
        restoreFocusRef={triggerRef}
      >
        {model.canWrite ? (
          <MenuItem onSelect={() => model.setEditing(true)}>
            <SquarePen aria-hidden="true" className="size-4" /> Edit plan
          </MenuItem>
        ) : null}
        <MenuItem onSelect={() => setDialog('baselines')}>
          <Layers aria-hidden="true" className="size-4" /> Baselines…
        </MenuItem>
        <MenuItem onSelect={() => setDialog('calendar')}>
          <CalendarDays aria-hidden="true" className="size-4" /> Calendar…
        </MenuItem>
      </Menu>

      <Dialog
        open={dialog === 'baselines'}
        onClose={() => setDialog(null)}
        title="Baselines"
        description="Frozen snapshots of the schedule to compare against. The active baseline drives the variance shown in the activities table."
        size="lg"
      >
        <BaselinesPanel orgSlug={orgSlug} planId={planId} canManage={model.canWrite} />
      </Dialog>

      <Dialog
        open={dialog === 'calendar'}
        onClose={() => setDialog(null)}
        title="Working-day calendar"
        description="The calendar that sets which days are working days (and holidays) for this plan's schedule."
      >
        <PlanCalendarPicker
          orgSlug={orgSlug}
          plan={plan}
          calendars={model.calendars.data ?? []}
          calendarsLoading={model.calendars.isPending}
          canEdit={model.canWrite}
        />
      </Dialog>
    </>
  );
}
