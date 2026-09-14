import { SectionCard } from '@/components/ui/page';

/**
 * One shape for every panel: the page archetype, plus the one thing the archetype does not have —
 * a polite status region.
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
export function Panel({
  title,
  status,
  children,
  id,
}: {
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
  children: React.ReactNode;
}): React.ReactElement {
  return (
    // `exactOptionalPropertyTypes` is on, so an explicit `undefined` is not the same as omitting
    // the prop — spread it conditionally rather than widening `SectionCardProps` to accept one.
    <SectionCard title={title} {...(id === undefined ? {} : { id })}>
      <div className="space-y-4">
        <p aria-live="polite" className="sr-only">
          {status}
        </p>
        {children}
      </div>
    </SectionCard>
  );
}
