import { useEffect, useState } from 'react';

import { SectionCard } from './section-card';
import { useStatusMuted } from './status-mute';

/**
 * One shape for every panel: the page archetype, plus the one thing the archetype does not have —
 * a polite status region.
 *
 * **It lives here, and not in `features/staff`, because two features use it.** It was
 * `features/staff/ui/panel.tsx` and the performance probe imported it from there, a feature-to-feature
 * import that would have become a cycle the moment the console's screen moved into `features/staff`
 * (spec §0.3, staff console redesign M0).
 *
 * **It composes `SectionCard` rather than reimplementing it** (ADR-0062's extraction argument,
 * applied before the divergence rather than after it), so a staff panel and every other titled
 * section in the product cannot drift apart. That drift would be invisible: each looks right alone,
 * and only a reader who opened two screens side by side would ever see one is a version behind.
 *
 * Written originally after the component review found this file was the **only** place in the
 * codebase using `Card` against its documented composition contract, five times, each reinventing
 * the spacing scale. The archetype is the general answer to that, and the console was simply
 * written before it existed.
 *
 * **What changes on screen, and none of it is a defect** (spec §8.5). The heading goes from
 * `text-lg font-medium` (18 px / 500) to the archetype's `text-base` + `font-semibold` (16 px /
 * 600) — the system's rank treatment, applied here for the first time. And `CardContent`'s
 * `space-y-4` is lost, because `SectionCardProps` is a closed interface that passes `className` to
 * the `Card` and not to its content: the fix is the `<div>` below rather than widening the
 * archetype for one caller's spacing.
 *
 * The old docblock's reason for avoiding `CardTitle` — *"it renders an `h1` and this page already
 * has one"* — was right and is now the archetype's problem rather than this file's: `SectionCard`
 * passes `level={2}` once, centrally, so eight panels stop each making the same decision.
 */
export interface StatusSectionProps {
  title: string;
  /** The section's anchor id — the target of the status summary's "jump to" link (spec §8.4). */
  id?: string;
  /**
   * What this panel says once its query settles, announced politely — WCAG 4.1.3.
   *
   * Empty while pending, and that is the whole mechanism: the region is mounted before the answer
   * exists, so filling it later is a change a screen reader speaks. Without it each panel's
   * `Spinner` (`role="status"`) simply unmounts and is replaced by silent content, leaving a
   * screen-reader user to re-explore the page to learn that panel N has finished — on the one
   * screen whose entire purpose is "is it broken *now*". The pattern is `AuditEventList`'s.
   */
  status: string;
  /**
   * A read is in flight and the figures shown may be about to change — `aria-busy` on the section,
   * so assistive technology waits for the answer rather than reading a half-updated one. It is a
   * statement about the content, not a loading indicator: the caller still shows whatever it shows.
   */
  busy?: boolean;
  /**
   * When the sentence is spoken (ADR-0178 D-6, amending ADR-0143 D2).
   *
   * - `settle` (the default, and what every caller had before) speaks it the moment it first
   *   appears. Right for a panel whose answer arrives because the reader pressed something
   *   (Diagnostics, a probe run).
   * - `change` treats the first sentence as the panel's **resting state**: it is written as plain
   *   text a reader can reach, and only a LATER, different sentence (a refresh that changed a
   *   figure, a retry that answered, a read that failed after it had answered) goes to the live
   *   region. A standing condition is not an event (ADR-0132), and seven panels each announcing
   *   theirs as the page loaded was seven interruptions of one reader; the page speaks one sentence
   *   instead.
   *
   *   **A failure on first load is the baseline too, and is NOT spoken from here.** Its sentence
   *   is the first one the panel settles on, so it is plain text; what a screen reader hears is
   *   `QueryErrorState`'s own `role="alert"` (`QueryPanel` renders it). A caller that uses `change`
   *   without a body that announces its own failure would leave a first-load failure silent.
   *
   *   **The switch is a one-way latch.** Once any later sentence has arrived the section speaks
   *   every sentence from then on, including one equal to the baseline: a reader who was told
   *   "failed" must also be told it is "fine" again.
   *
   * While the screen has muted its sections (`StatusMuteProvider`, ADR-0178 D8) a `change` section
   * writes any sentence as plain text and makes it the new baseline, latch reset — **from an
   * effect, so a strict-mode double render cannot desynchronise it** — and so nothing reached
   * during the window is spoken after it.
   */
  announce?: 'settle' | 'change';
  /** One sentence saying what the box holds, under its heading. */
  description?: React.ReactNode;
  children: React.ReactNode;
}

export function StatusSection({
  title,
  status,
  children,
  id,
  busy,
  announce = 'settle',
  description,
}: StatusSectionProps): React.ReactElement {
  // `baseline` is the first settled sentence and `changed` latches once a different one arrives.
  // State rather than a ref, set during render under a guard: it is derived from the props alone
  // and a ref written in render is the pattern the hooks lint rule exists to refuse.
  const [baseline, setBaseline] = useState<string | null>(null);
  const [changed, setChanged] = useState(false);
  const muted = useStatusMuted();
  if (announce === 'change' && !muted) {
    if (baseline === null && status !== '') setBaseline(status);
    else if (baseline !== null && !changed && status !== baseline) setChanged(true);
  }
  const resting = announce === 'change' && (muted || !changed);
  // The re-baseline for a muted window. An effect and not render: the unmute lands in a later
  // commit, and every commit that carried a new sentence has run this effect before it, so the
  // first unmuted render finds baseline === status and speaks nothing it merely witnessed.
  useEffect(() => {
    if (announce !== 'change' || !muted) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- must not run in render: strict mode replays it
    if (status !== '') setBaseline(status);
    setChanged(false);
  }, [announce, muted, status]);

  return (
    // `exactOptionalPropertyTypes` is on, so an explicit `undefined` is not the same as omitting
    // the prop — spread it conditionally rather than widening `SectionCardProps` to accept one.
    <SectionCard
      title={title}
      {...(id === undefined ? {} : { id })}
      {...(busy === true ? { busy } : {})}
      {...(description === undefined ? {} : { description })}
    >
      {/* `-mt-2` takes the header's 24 px bottom padding to 16: every panel's first line sits one
          fixed distance under its description (or heading), whatever that first line is. */}
      <div className="-mt-2 space-y-4">
        {resting ? <p className="sr-only">{status}</p> : null}
        <p aria-live="polite" className="sr-only">
          {resting ? '' : status}
        </p>
        {children}
      </div>
    </SectionCard>
  );
}
