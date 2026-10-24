import { useMemo } from 'react';

import { membersBySwimlane } from '../model/swimlane-order';
import type { SwimlaneDialogsProps } from '../model/use-swimlane-management';

import { SwimlaneDeleteDialog } from './SwimlaneDeleteDialog';
import { SwimlaneManageDialog } from './SwimlaneManageDialog';
import { SwimlaneRenameDialog } from './SwimlaneRenameDialog';
import { SwimlaneSetupDialog } from './SwimlaneSetupDialog';

/**
 * The four swimlane dialogs, mounted once by the workspace and driven by {@link
 * SwimlaneDialogsProps} (`useSwimlaneManagement`). Rename and delete are separate dialogs because
 * the gutter's menu opens them directly, and they stack over Manage when it is the caller.
 *
 * Each `Dialog` mounts its children only while open, so the working state inside them lives for
 * one opening (ADR-0169).
 */
export function SwimlaneDialogs({
  state,
  close,
  openRename,
  openDelete,
  plan,
  afterDelete,
  swimlanes,
  activities,
  actions,
  gate,
}: SwimlaneDialogsProps): React.ReactElement {
  const known = useMemo(() => new Set(swimlanes.map((s) => s.id)), [swimlanes]);
  const memberCounts = useMemo(
    () => membersBySwimlane(activities ?? [], known),
    [activities, known],
  );
  const renaming = swimlanes.find((s) => s.id === state.renameId) ?? null;
  const deleting = swimlanes.find((s) => s.id === state.deleteId) ?? null;
  return (
    <>
      <SwimlaneSetupDialog
        open={state.setup}
        onClose={() => close('setup')}
        plan={plan}
        swimlanes={swimlanes}
        actions={actions}
        gate={gate}
      />
      <SwimlaneManageDialog
        open={state.manage}
        onClose={() => close('manage')}
        swimlanes={swimlanes}
        memberCounts={memberCounts}
        actions={actions}
        gate={gate}
        onRename={openRename}
        onDelete={openDelete}
      />
      <SwimlaneRenameDialog
        open={state.renameId !== null}
        onClose={() => close('renameId')}
        swimlane={renaming}
        otherNames={swimlanes.filter((s) => s.id !== state.renameId).map((s) => s.name)}
        actions={actions}
        gate={gate}
      />
      <SwimlaneDeleteDialog
        open={state.deleteId !== null}
        onClose={() => close('deleteId')}
        swimlane={deleting}
        memberCount={deleting ? (memberCounts.get(deleting.id) ?? 0) : 0}
        actions={actions}
        onDeleted={afterDelete}
      />
    </>
  );
}
