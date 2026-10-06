import { Alert, type AlertTone } from '@/components/ui/alert';
import { Disclosure } from '@/components/ui/disclosure';

export interface ConditionStripProps {
  /**
   * The verdict, one word or a short phrase, without punctuation: "Disabled", "Failing". It leads
   * the sentence in the same weight as the rest — see below.
   */
  verdict: string;
  /** What is true, in one sentence of plain language. */
  children: React.ReactNode;
  /** The remedy, behind a "How to fix" disclosure — where technical names (variables, log keys) live. */
  howToFix?: React.ReactNode;
  /** `error` for a problem, `info` for a state that is not one. Never `success`: a healthy state needs no strip. */
  tone?: Extract<AlertTone, 'error' | 'info'>;
  id?: string;
}

/**
 * A standing condition: a verdict, one sentence, and the remedy one press away.
 *
 * **It renders `Alert purpose="condition"`** (ADR-0132): the state was already true when the reader
 * arrived, so it has no live role and interrupts nobody. The `tone` still says how serious it is.
 *
 * **There is no bold lead-in**, which is what it replaces: five stacked alerts on `/staff` each began
 * `<strong>…</strong>`, and the ADR-0097 weight ratchet allows no second heavy weight beside the
 * heading. The verdict is the sentence's first word, and the severity is carried by the tone's icon
 * and ink as it always was — never by weight, and never by colour alone (the verdict is a word).
 *
 * **The remedy is a `Disclosure` with `collapsed="hidden"`.** A reader who needs it is one press
 * away and a reader who does not is not asked to read an environment variable name. Its content is
 * not rendered while folded, so nothing focusable hides in it.
 */
export function ConditionStrip({
  verdict,
  children,
  howToFix,
  tone = 'info',
  id,
}: ConditionStripProps): React.ReactElement {
  return (
    <Alert purpose="condition" tone={tone} {...(id === undefined ? {} : { id })}>
      <p>
        {verdict}. {children}
      </p>
      {howToFix === undefined ? null : (
        <Disclosure
          label="How to fix"
          collapsed="hidden"
          className="mt-1"
          triggerClassName="text-inherit"
        >
          <div className="text-foreground">{howToFix}</div>
        </Disclosure>
      )}
    </Alert>
  );
}
