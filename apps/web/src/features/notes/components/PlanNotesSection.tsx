import { useId } from 'react';

import type { NoteTarget } from '../schemas/note-schemas';

import { NoteComposer } from './NoteComposer';
import { NoteThread } from './NoteThread';

import { useSession } from '@/features/auth';

/**
 * The **Notes** section for a plan (ADR-0046) — the plan's note thread plus, for a writer, a composer.
 * Mounted behind `VITE_NOTES` at the same sites as the programme section (the plan-detail route and the
 * canvas plan workspace). The heading level is context-aware so it never skips a level (WCAG 1.3.1 /
 * 2.4.6): the workspace hosts mount it under the plan `h1`, so it defaults to `h2`; the plan-detail
 * route nests it beside the `Schedule` block's `h3` siblings, so it passes `3`. Not pen-gated.
 */
export function PlanNotesSection({
  orgSlug,
  planId,
  canWrite = false,
  headingLevel = 2,
  bounded = false,
}: {
  orgSlug: string;
  planId: string;
  /** Contributor upward (role-derived by the host); Viewer reads only. */
  canWrite?: boolean;
  headingLevel?: 2 | 3;
  /**
   * Cap the thread height with an internal scroll — set when mounted in the fixed-height canvas
   * workspace header so a growing thread can't push the canvas below its floor (ADR-0030/0031).
   */
  bounded?: boolean;
}): React.ReactElement {
  const session = useSession();
  const currentUserId = session.data?.user.id ?? null;
  const headingId = useId();
  const target: NoteTarget = { planId, activityId: null };
  const Heading = headingLevel === 2 ? 'h2' : 'h3';

  return (
    <section
      aria-labelledby={headingId}
      className="border-border flex flex-col gap-3 rounded-lg border p-4"
    >
      <div className="flex flex-col gap-0.5">
        <Heading id={headingId} className="text-sm font-medium">
          Notes
        </Heading>
        <p className="text-muted-foreground text-sm">
          Attributed notes on this plan — a running record of the reasoning behind the schedule.
          Newest first.
        </p>
      </div>
      {canWrite ? <NoteComposer orgSlug={orgSlug} target={target} /> : null}
      <NoteThread
        orgSlug={orgSlug}
        target={target}
        currentUserId={currentUserId}
        bounded={bounded}
      />
    </section>
  );
}
