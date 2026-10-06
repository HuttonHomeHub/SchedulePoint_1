import { useCallback, useEffect, useRef, useState } from 'react';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { ListRow, SectionCard, rowLinkClass } from '@/components/ui/page';
import type { CheckView, ConsoleStatus } from '@/features/staff/model/console-status';
import { cn } from '@/lib/utils';

/**
 * The console's first viewport: is anything wrong right now, and where.
 *
 * **It is NOT a live region, and that is a decision rather than an omission.** Every condition here
 * is a standing fact about the installation — mail has no transport, the sweep is off, 68 accounts
 * cannot sign in. ADR-0132's discriminator is whether the sentence would read the same to somebody
 * who arrived five minutes later and did nothing, and for all of these it would. A live region
 * would announce the installation's resting state as though it had just happened, and it would do
 * so on page load, when the reader is already being told everything. Each panel keeps its own
 * polite `status` sentence for the thing a live region IS for: a query settling.
 *
 * **It renders rows, not a paragraph, whatever the verdict.** The first design rendered a sentence
 * when healthy and rows when not — two shapes for one component, which is the defect this whole
 * epic exists to remove. Rows always means "what did you check?" is answered structurally rather
 * than by composed prose, and it means `PENDING` and `UNREADABLE` get a line each instead of being
 * buried in a clause. For a seasoned admin it is also a constant-time table of contents for a page
 * that is still seven screens long.
 *
 * **Every row is a link and the WHOLE row is the target.** WCAG 2.5.8, and the specific shape
 * ADR-0090 and ADR-0110 both record shipping wrong: a caret or an icon as the only hit area,
 * invisible to a target-size sweep because the sweep measures the element carrying the item
 * attribute and not its sibling. It reuses `ListRow` + `rowLinkClass` rather than inventing a list
 * of links, because `NeedsAttentionSection` is the same problem already solved and reviewed — this
 * is the product's second "is anything wrong" surface and it should look like a sibling of the
 * first.
 *
 * **Severity is carried by words and by the value, never by position or colour alone** (WCAG 1.4.1).
 * The rows keep the page's order in every state (ADR-0178, amending ADR-0143 D1): sorted by severity
 * the same row landed somewhere different on each visit. Each row states the fact behind its verdict,
 * so "OK" is never the only thing a row says. The tone is a second channel on top of the verdict
 * word, which is `health-rows.ts`'s rule and its vocabulary.
 */

/**
 * The badge variant for each tone. **`muted` is the outline**, so *Checking* and *Could not be read*
 * look different from *OK* and not only read differently: two states that mean "no verdict" drawn
 * identically to the one that means "fine" is the colour-only trap this surface was built to avoid.
 */
const BADGE_VARIANT: Record<CheckView['tone'], 'neutral' | 'warning' | 'outline'> = {
  fail: 'warning',
  info: 'neutral',
  muted: 'outline',
  pass: 'neutral',
};

export interface StaffStatusSummaryProps {
  status: ConsoleStatus;
  /**
   * The same action as the header's Refresh: the six named reads. Offered only when two or more
   * checks could not be read, so a single failure keeps its box's own Try again and nothing else.
   */
  onRetryAll?: () => void;
  /**
   * A refresh is in flight; the button is shaded and its handler refuses. It stays mounted for the
   * whole run even when the retry takes the unreadable count below two, because it is the control
   * that has focus (ADR-0135): removing it mid-run drops focus to `<body>`.
   */
  retrying?: boolean;
}

export function StaffStatusSummary({
  status,
  onRetryAll,
  retrying = false,
}: StaffStatusSummaryProps): React.ReactElement {
  const sectionRef = useRef<HTMLElement>(null);
  const hadFocus = useRef(false);
  // Set by a press of the button, so it outlives the condition that offered it until the run ends.
  const [pressed, setPressed] = useState(false);
  if (pressed && !retrying) setPressed(false);
  const offered = onRetryAll !== undefined && (status.unreadableCount >= 2 || pressed);

  // A ref's cleanup runs while the node is still attached, the only moment its focus can be read.
  const setButton = useCallback((node: HTMLButtonElement | null) => {
    if (node === null) return;
    return () => {
      if (document.activeElement === node) hadFocus.current = true;
    };
  }, []);

  // When the run has settled and the button is withdrawn with focus on it, hand focus to the section
  // it sat in (WCAG 2.4.3). The section is always mounted and is a focus target by its `id`, so focus
  // lands somewhere stable instead of on `<body>`.
  useEffect(() => {
    if (!hadFocus.current) return;
    hadFocus.current = false;
    sectionRef.current?.focus();
  });

  return (
    <SectionCard
      title="Status"
      id="staff-status"
      ref={sectionRef}
      description={status.sentence}
      {...(status.allHealthy ? {} : { className: 'border-warning/40' })}
    >
      <ul className="divide-border divide-y">
        {status.checks.map((check) => (
          <li key={check.id}>
            <ListRow
              primary={
                <div className="min-w-0">
                  {/* The anchor, not a script-driven scroll: a real link is focusable, has a
                      keyboard and middle-click contract the platform already provides, and survives
                      a reader opening it in a new tab. The whole row is inside it. */}
                  <a className={cn(rowLinkClass, 'block')} href={`#${check.sectionId}`}>
                    {check.label}
                  </a>
                  <p className="text-muted-foreground mt-0.5 text-sm">{check.value}</p>
                </div>
              }
              trailing={<Badge variant={BADGE_VARIANT[check.tone]}>{check.verdictLabel}</Badge>}
            />
          </li>
        ))}
      </ul>
      {offered ? (
        <Button
          ref={setButton}
          variant="outline"
          size="sm"
          className="mt-4"
          aria-disabled={retrying}
          aria-busy={retrying}
          onClick={() => {
            if (retrying || onRetryAll === undefined) return;
            setPressed(true);
            onRetryAll();
          }}
        >
          {retrying ? 'Trying again…' : 'Try again for all'}
        </Button>
      ) : null}
    </SectionCard>
  );
}
