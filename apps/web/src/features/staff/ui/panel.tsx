import { Card, CardContent, CardHeader } from '@/components/ui/card';

/**
 * One shape for every panel: `Card` composed through its own `CardHeader`/`CardContent` parts
 * rather than a hand-rolled `p-4`, and one heading treatment.
 *
 * Written after the component review found this file was the **only** place in the codebase using
 * `Card` against its documented composition contract, five times, each reinventing the spacing
 * scale — and that two of the five panels rendered a failure as a bare un-carded `Alert` while the
 * other three boxed it, for no reason a reader could infer.
 *
 * `CardTitle` is deliberately not used: it renders an `h1` (`card.tsx:50`) and this page already
 * has one. The composition contract is what was worth reusing, not the heading element.
 */
export function Panel({
  title,
  status,
  children,
}: {
  title: string;
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
    <Card>
      <CardHeader>
        <h2 className="text-lg font-medium">{title}</h2>
      </CardHeader>
      <CardContent className="space-y-4">
        <p aria-live="polite" className="sr-only">
          {status}
        </p>
        {children}
      </CardContent>
    </Card>
  );
}
