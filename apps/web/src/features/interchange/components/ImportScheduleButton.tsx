import { useState } from 'react';

import { ImportScheduleDialog } from './ImportScheduleDialog';

import { Button } from '@/components/ui/button';
import { SCHEDULE_INTERCHANGE_ENABLED } from '@/config/env';

/**
 * The **Import from file…** entry on a project's plan-create surface (ADR-0050, Stage C2 M1). It opens
 * the {@link ImportScheduleDialog} for the current project (the target is pre-filled from context).
 *
 * Self-gating so the parent surface can render it unconditionally and stay simple: it renders **nothing**
 * unless BOTH the `VITE_SCHEDULE_INTERCHANGE` flag is on AND the caller holds `interchange:import`
 * (`canImport`, Planner + Org Admin) — so flag-off or an unauthorised role leaves the plan-create
 * surface byte-for-byte today's (no entry). The API still enforces the permission + org scope; this gate
 * is UX only.
 */
export function ImportScheduleButton({
  orgSlug,
  projectId,
  projectName,
  canImport,
}: {
  orgSlug: string;
  projectId: string;
  projectName: string;
  /** Whether the current user may import (mirrors `interchange:import`). */
  canImport: boolean;
}): React.ReactElement | null {
  const [open, setOpen] = useState(false);

  if (!SCHEDULE_INTERCHANGE_ENABLED || !canImport) return null;

  return (
    <>
      <Button variant="outline" onClick={() => setOpen(true)}>
        Import from file…
      </Button>
      <ImportScheduleDialog
        orgSlug={orgSlug}
        projectId={projectId}
        projectName={projectName}
        open={open}
        onClose={() => setOpen(false)}
      />
    </>
  );
}
