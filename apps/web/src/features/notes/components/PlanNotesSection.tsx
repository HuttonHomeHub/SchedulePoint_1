import type { NoteTarget } from '../schemas/note-schemas';

import { NoteComposer } from './NoteComposer';
import { NoteThread } from './NoteThread';

import { useSession } from '@/features/auth';

/**
 * The plan's note thread (ADR-0046) plus, for a writer, a composer. Its one host is the docked notes
 * panel in the plan workspace, whose `SheetHeader` ("Plan notes") is the single header and whose
 * `<section>` is the landmark — so this renders no heading, intro paragraph or card of its own, only
 * the composer and the thread in a plain wrapper. Not pen-gated.
 */
export function PlanNotesSection({
  orgSlug,
  planId,
  canWrite = false,
}: {
  orgSlug: string;
  planId: string;
  /** Contributor upward (role-derived by the host); Viewer reads only. */
  canWrite?: boolean;
}): React.ReactElement {
  const session = useSession();
  const currentUserId = session.data?.user.id ?? null;
  const target: NoteTarget = { planId, activityId: null };

  return (
    <div className="flex flex-col gap-3">
      {canWrite ? <NoteComposer orgSlug={orgSlug} target={target} /> : null}
      <NoteThread orgSlug={orgSlug} target={target} currentUserId={currentUserId} />
    </div>
  );
}
