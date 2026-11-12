import { cva, type VariantProps } from 'class-variance-authority';
import { Children } from 'react';

import { cn } from '@/lib/utils';

/**
 * The chrome of a **notice strip**: one line of text, optional actions on the right.
 *
 * Extracted because four had been hand-rolled — `EditConflictBanner`, the two faces of
 * `CanvasModeBand`, and the canvas empty state — each restating the same rounded-bordered row with
 * its own spacing, its own radius and its own opinion about whether to go through `cn()`. Three of
 * the four had drifted on at least one of those (`rounded-lg` vs `rounded-md`, `py-2` vs `py-1.5`,
 * `items-start` vs `items-center`) with no reason behind any of the differences, which is the shape
 * `docs/COMPONENT_LIBRARY.md` names as the extraction threshold.
 *
 * `tone` and `emphasis` are separate axes on purpose. A dashed border says "nothing is wrong, this
 * is an offer or an empty state" (the empty-plan notice, the Arrange and whole-plan Follow logic
 * offers: a standing condition the reader may ignore); a solid one says "here is something that
 * happened". That is orthogonal to whether the thing is neutral,
 * a warning, or the tool you currently have armed — and collapsing them into one `variant` list is
 * how a fifth caller ends up adding `neutralDashed`.
 *
 * `min-w-0` on the strip is what lets the default `truncate` fit work at all. The strip is itself a
 * flex item of the dock's outlet, and a flex item cannot shrink below its content width unless it
 * says so; the sentence's own `min-w-0` only applies INSIDE the strip, so without this the strip
 * kept the full width of a long sentence, spilled out of the outlet, and carried its buttons under
 * the foot row's clip (measured, `docs/specs/placed-bar-follows-link/m0-measurement.md` M0b).
 *
 * `destructive` is for a condition that blocks the action, never a transient message; multi-sentence
 * errors use `Alert tone="error"` (ADR-0132).
 */
const noticeStripVariants = cva('flex min-w-0 gap-3 border px-3 text-sm', {
  variants: {
    tone: {
      // Each pair is a `*-text` token on its own surface fill — the DESIGN_SYSTEM.md colour rule.
      neutral: 'border-border text-muted-foreground',
      // The armed-tool face: the plan's accent, stated on the accent's own wash.
      accent: 'border-primary/40 bg-primary/10 text-foreground',
      // A settled fact rather than a live mode — deliberately quieter than `accent`.
      muted: 'border-border bg-muted/60',
      info: 'border-info/40 bg-info/10 text-info-text',
      warning: 'border-warning/40 bg-warning/10 text-warning-text',
      destructive: 'border-destructive/40 bg-destructive/10 text-destructive-text',
    },
    emphasis: {
      solid: 'rounded-md',
      /** Nothing here yet — an empty state, never a message about something that happened. */
      dashed: 'rounded-md border-dashed',
    },
    density: {
      /** A mode statement or an empty state: one line, tight. */
      compact: 'items-center justify-between py-1.5',
      /** A message that may wrap to two lines, with its actions aligned to the first. */
      comfortable: 'items-start py-2',
    },
  },
  defaultVariants: { tone: 'neutral', emphasis: 'solid', density: 'compact' },
});

export interface NoticeStripProps
  extends
    Omit<React.HTMLAttributes<HTMLDivElement>, 'children'>,
    VariantProps<typeof noticeStripVariants> {
  /** The sentence. Rendered in its own `<p>` so an action beside it is never read as part of it. */
  message: React.ReactNode;
  /**
   * Whether the message takes the leftover width (`grow`) or only what it needs (`truncate`).
   * `truncate` cuts a one-line sentence with an ellipsis rather than let it push its buttons out of
   * a narrow container (it needs the strip's own `min-w-0` to do so); `grow` lets a two-line
   * conflict message use the room and keeps its buttons hard right.
   *
   * `wrap` is for a sentence that must be read whole (placed-bar-follows-link, ADR-0216): the strip
   * wraps, so when the sentence and its buttons do not fit on one line the buttons drop UNDER the
   * sentence, grouped and trailing, instead of the sentence being cut. The message's floor is
   * `min(16rem, 100%)` (see ADR-0187 D2: a floor never wider than the row it sits in), so it takes
   * a line of its own before it narrows past a readable measure. Pair it with `density="comfortable"`.
   */
  messageFit?: 'grow' | 'truncate' | 'wrap';
  /** Buttons, in reading order. Anything falsy renders nothing, so a caller can pass a condition. */
  children?: React.ReactNode;
}

/**
 * A horizontal strip: a sentence, and optionally something to do about it.
 *
 * The **role is the caller's** — deliberately not derived from `tone`. A rejected write wants
 * `role="alert"`, a succeeded-but-note wants `role="status"`, and a mode band wants **neither**,
 * because the surface around it already announces every transition through the app's single polite
 * region and a second live region would say the same sentence twice. A tone→role mapping would get
 * that third case wrong by construction.
 *
 * **`Alert` answers the same question the opposite way, and the disagreement is deliberate**
 * (ADR-0132). It derives the role from `tone` and takes a `purpose` that decides only WHETHER it is
 * a live region — two outcomes. This primitive's callers span **three** (`alert`, `status`, and
 * none), which two values cannot express, and it has no tone vocabulary rich enough to derive from.
 * The reverse also holds: `Alert` carries several sentences with markup inside a bordered, iconned
 * block, and this is one truncating line — so neither is the other's home. Recorded here as well as
 * there because the two docblocks contradicted each other for months and had never been read side
 * by side, which is exactly the "two call sites answer this differently" failure `Alert`'s own
 * docblock warns about, happening BETWEEN primitives where nothing was watching.
 */
export function NoticeStrip({
  message,
  messageFit = 'truncate',
  tone,
  emphasis,
  density,
  className,
  children,
  ...props
}: NoticeStripProps): React.ReactElement {
  if (messageFit === 'wrap') {
    return (
      <div
        className={cn(noticeStripVariants({ tone, emphasis, density }), 'flex-wrap', className)}
        {...props}
      >
        {/* The 16 rem floor, capped at the strip's own width, is the point at which the sentence stops
            sharing a line with its buttons; an arbitrary value because no token names a measure. */}
        <p className="min-w-[min(16rem,100%)] flex-1">{message}</p>
        {Children.toArray(children).length > 0 ? (
          // One group, so the buttons wrap together and never leave one stranded beside the text.
          <div className="ml-auto flex max-w-full flex-wrap justify-end gap-2">{children}</div>
        ) : null}
      </div>
    );
  }
  return (
    <div className={cn(noticeStripVariants({ tone, emphasis, density }), className)} {...props}>
      <p className={messageFit === 'grow' ? 'flex-1' : 'min-w-0 truncate'}>{message}</p>
      {children}
    </div>
  );
}

export { noticeStripVariants };
