import type { ActivitySummary } from '@repo/types';
import type { Ref } from 'react';

import type { NoteTarget } from '../schemas/note-schemas';

import { NoteComposer } from './NoteComposer';
import { NoteThread } from './NoteThread';

import { useSession } from '@/features/auth';

/**
 * The **Notes** section of an activity's Logic panel (ADR-0046) — the activity's note thread plus, for
 * a writer, a composer. Passed into the {@link DependencyEditor}'s `notesSlot` by the composition root
 * only behind `VITE_NOTES`, so this feature stays free of a sideways feature → feature import and the
 * panel is byte-identical with the flag off. Heading is an `h3` to sit level with the panel's other
 * sections (Predecessors / Successors / Cross-plan links). Not pen-gated (ADR-0046).
 */
export function ActivityNotesSection({
  orgSlug,
  planId,
  activity,
  canWrite = false,
  enabled,
  headingRef,
}: {
  orgSlug: string;
  planId: string;
  activity: ActivitySummary;
  /** Contributor upward (role-derived by the host); Viewer reads only. */
  canWrite?: boolean;
  /** Keep the thread query idle while the host dialog is closed (mirrors the dependency editor). */
  enabled: boolean;
  /**
   * A ref to the section heading, so the Logic dialog can scroll it into view + move focus to it when
   * opened via the toolbar **Add note** button (toolbar quick-wins U4/A4). When set, the heading is made
   * programmatically focusable (`tabIndex={-1}`) without joining the tab order (WCAG 2.4.3), mirroring
   * {@link PlanNotesSection}'s `headingRef`. Absent ⇒ unchanged (no ref, no tabindex).
   */
  headingRef?: Ref<HTMLHeadingElement>;
}): React.ReactElement {
  const session = useSession();
  const currentUserId = session.data?.user.id ?? null;
  const target: NoteTarget = { planId, activityId: activity.id };

  return (
    <section className="flex flex-col gap-2">
      <h3
        className="text-sm font-medium"
        {...(headingRef ? { ref: headingRef, tabIndex: -1 } : {})}
      >
        Notes
      </h3>
      <p className="text-muted-foreground text-sm">
        Attributed notes on this activity — the reasoning behind its dates. Newest first.
      </p>
      {canWrite ? <NoteComposer orgSlug={orgSlug} target={target} /> : null}
      <NoteThread
        orgSlug={orgSlug}
        target={target}
        currentUserId={currentUserId}
        enabled={enabled}
      />
    </section>
  );
}
