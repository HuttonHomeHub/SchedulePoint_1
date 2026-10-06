import { useEffect, useId } from 'react';

import { Button } from '@/components/ui/button';
import { useClipboardCopy } from '@/hooks/use-clipboard-copy';

export interface CopyButtonProps {
  /**
   * The text to copy, produced on press, or `null` when there is nothing to copy yet.
   *
   * A function and not a string so a report that is expensive to format is formatted when somebody
   * asks for it rather than on every render. `null` shades the button — see below.
   */
  text: (() => string) | null;
  /** What is being copied, as a noun phrase: "Diagnostics report". It makes "<Subject> copied." */
  subject: string;
  /** The visible label. Its first word is "Copy". */
  children: React.ReactNode;
  /**
   * Why there is nothing to copy, shown **as visible text beside the button** while `text` is `null`.
   * Required in that state by the types' intent and by the review that asked for it: a shaded
   * control whose reason is only an `sr-only` sentence leaves a sighted reader looking at a faint
   * button with no explanation, and the faintness is exempt from contrast (WCAG 1.4.3) only because
   * the control is inactive — which is exactly when it needs words.
   */
  unavailableReason?: string;
  /**
   * An accessible name when the visible label is not enough on its own — N copy buttons on one page
   * (one per sitting) need telling apart. It must contain the visible label (WCAG 2.5.3).
   */
  'aria-label'?: string;
  size?: 'default' | 'sm';
  /**
   * Return to idle when this changes. A copy confirmation belongs to the text it copied, so a caller
   * whose text has been replaced ("Copied." beside numbers that have since changed) changes the key.
   */
  resetKey?: unknown;
}

/** One sentence for a refusal, everywhere. The reader has to know to select the text by hand. */
const FAILED = 'Couldn’t copy. Select the text and copy it yourself.';

/**
 * A button that copies a report to the clipboard and says what happened, in one wording.
 *
 * **It wraps `useClipboardCopy`** (the announcement, the missing-API guard and the rejection branch
 * live there) and adds what five call sites had each written differently: the label, a **visible**
 * "Copied." beside the button, and the shaded state.
 *
 * **The visible text is not a live region, on purpose.** The hook announces through the app's one
 * polite region, so a second `aria-live` here would read the same sentence twice to the same reader.
 * What the text adds is the cue a sighted reader needs, which an announcement cannot give them.
 *
 * **Shaded, not disabled, and never `pointer-events-none` at rest** (`docs/TECH_DEBT.md` #458,
 * ADR-0082). With nothing to copy the button is `aria-disabled`, stays focusable and refuses the
 * press, so a keyboard reader reaches it and learns why; the hover fill is cancelled instead of
 * the pointer being switched off, because `pointer-events: none` made the pointer see whatever was
 * behind the button and left the reason unreachable by hover. The hover-cancel pair is the outline
 * variant's own, which is the only variant this offers.
 */
export function CopyButton({
  text,
  subject,
  children,
  unavailableReason,
  'aria-label': ariaLabel,
  size = 'default',
  resetKey,
}: CopyButtonProps): React.ReactElement {
  const reasonId = useId();
  const clipboard = useClipboardCopy({
    copiedMessage: `${subject} copied.`,
    failedMessage: FAILED,
  });
  const { reset } = clipboard;

  // A confirmation belongs to what it copied; a caller says when that has changed.
  useEffect(() => {
    reset();
  }, [resetKey, reset]);

  const shaded = text === null;

  return (
    <span className="inline-flex flex-wrap items-center gap-x-3 gap-y-1">
      <Button
        type="button"
        variant="outline"
        size={size}
        aria-disabled={shaded}
        aria-describedby={shaded && unavailableReason !== undefined ? reasonId : undefined}
        {...(ariaLabel === undefined ? {} : { 'aria-label': ariaLabel })}
        className="aria-disabled:hover:bg-background aria-disabled:hover:text-foreground aria-disabled:opacity-60"
        onClick={() => {
          // The guard the shading promises: a shaded control that still fires is a shading in
          // appearance only.
          if (text === null) return;
          clipboard.copy(text());
        }}
      >
        {children}
      </Button>
      {shaded && unavailableReason !== undefined ? (
        <span id={reasonId} className="text-muted-foreground text-sm">
          {unavailableReason}
        </span>
      ) : null}
      {clipboard.state === 'copied' ? (
        <span className="text-muted-foreground text-sm">Copied.</span>
      ) : null}
      {clipboard.state === 'failed' ? (
        <span className="text-muted-foreground text-sm">{FAILED}</span>
      ) : null}
    </span>
  );
}
