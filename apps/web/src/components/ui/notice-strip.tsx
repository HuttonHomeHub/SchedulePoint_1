import { cva, type VariantProps } from 'class-variance-authority';

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
 * `tone` and `emphasis` are separate axes on purpose. A dashed border says "there is nothing here
 * yet"; a solid one says "here is something". That is orthogonal to whether the thing is neutral,
 * a warning, or the tool you currently have armed — and collapsing them into one `variant` list is
 * how a fifth caller ends up adding `neutralDashed`.
 */
const noticeStripVariants = cva('flex gap-3 border px-3 text-sm', {
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
   * `truncate` keeps a one-line mode statement from pushing its Undo button off a narrow canvas;
   * `grow` lets a two-line conflict message use the room and keeps its buttons hard right.
   */
  messageFit?: 'grow' | 'truncate';
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
  return (
    <div className={cn(noticeStripVariants({ tone, emphasis, density }), className)} {...props}>
      <p className={messageFit === 'grow' ? 'flex-1' : 'min-w-0 truncate'}>{message}</p>
      {children}
    </div>
  );
}

export { noticeStripVariants };
