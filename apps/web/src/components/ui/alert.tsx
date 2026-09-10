import { cva, type VariantProps } from 'class-variance-authority';
import { AlertCircle, CheckCircle2, Info } from 'lucide-react';
import { forwardRef } from 'react';

import { cn } from '@/lib/utils';

/**
 * A message about what just happened, in the one treatment the product gives that (ADR-0077 §9).
 *
 * **The geometry is the previous Flask app's**, read from `static/css/auth.css:99-136` in
 * `HuttonHomeHub/SchedulePoint` rather than matched by eye: a 4px left accent bar, a low-opacity
 * tint of the same hue, a leading icon, `.9rem` text. The product owner asked for the old app's
 * alerts back and this is the shape of them.
 *
 * **The colours are tokens, not the old app's hex values, and that is not a shortcut.**
 * `packages/config/eslint/react.js:60-78` rejects colour literals in `className`/`style`, because a
 * literal cannot follow a surface scope and is invisible to `styles/token-contrast.test.ts` — the
 * gate that has now caught a real WCAG failure in four consecutive epics. Nothing is lost by
 * translating: the old app's own text-on-tint pairs measure 10.12:1 (error), 8.14:1 (success) and
 * 8.04:1 (info) over the white card, and the `*-text` tokens used here are already gated at ≥4.5:1
 * in every theme and every scope. The one value that IS the old app's is the success hue: on the
 * login scope the success token holds `#155724` converted to OKLCH, because unlike the other two
 * it had no token to translate into and had to be added (ADR-0077 §9.1).
 *
 * (That sentence names the token indirectly on purpose. `surface-seams.structural.test.ts` scans
 * raw file text for a family prefix, so spelling one here — even in prose — reads as a component
 * reaching into a scope and fails the gate. The gate is right to be that blunt: the thing it
 * guards against looks exactly like a comment until it is a `var()`.)
 *
 * **`radius` deliberately follows this app's controls, not the old app's 8px.** That number came
 * from `--border-radius: 8px`, which the old app applied to its inputs and buttons too — so copying
 * the figure without its context would make the alert the one element in the form with a radius of
 * its own. The faithful translation of "it matched its surroundings" is `rounded-md`.
 *
 * **Two axes, and only one of them is the caller's judgement.** `tone` owns the icon, the colour and
 * — for an event — how urgently to announce it: an error is assertive because it interrupts a task
 * the reader is mid-way through, a success or a note is polite because it reports something already
 * finished. That derivation is unchanged and `role` is still not a prop (`Omit<…, 'role'>` below),
 * because letting two call sites answer *how urgent is this* differently is how a message model
 * drifts.
 *
 * `purpose` answers a **different** question the primitive previously could not ask: is this an
 * event or a standing condition? An event just happened and a live region is right for it. A
 * standing condition — "no mail transport is configured", "retention sweeping is disabled" — is a
 * fact about the world that was already true when the reader arrived, and marking it live announces
 * it as though something had changed. Worse, such a caveat is usually rendered only once its query
 * settles, so the region and its content are inserted **together**, which is the unreliable case for
 * a live region rather than the silent one.
 *
 * **The discriminator, when a call site is not obvious:** would this sentence read the same to
 * somebody who arrived five minutes later and did nothing? If yes it is a `condition`.
 *
 * **`purpose` has no default, deliberately** — the caller states which case they are in, so the
 * wrong announcement cannot be reached by omission. That is `useTooltip`'s shape for `useTooltip`'s
 * stated reason (`tooltip.tsx:44-55`), and it is the reason a `live={false}` boolean was rejected:
 * a boolean records the mechanism and not the reason, so the next author cannot tell which case
 * theirs is.
 *
 * **`NoticeStrip` deliberately answers this the other way** and takes its `role` from the caller
 * (`notice-strip.tsx`). The two primitives disagree on purpose: this one carries four sentences with
 * markup inside a bordered, iconned block and has a tone vocabulary to derive from; that one is a
 * single truncating line whose callers span three different role outcomes, which two values cannot
 * express. Neither is the other's home — see `docs/TECH_DEBT.md` #118.
 */
const alertVariants = cva('flex items-start gap-3 rounded-md border-l-4 p-3 text-sm', {
  variants: {
    tone: {
      error: 'border-destructive-text bg-destructive-text/10 text-destructive-text',
      success: 'border-success-text bg-success-text/10 text-success-text',
      info: 'border-info-text bg-info-text/10 text-info-text',
    },
  },
  defaultVariants: { tone: 'error' },
});

/**
 * The tones, and the two facts each one fixes: which icon, and — for an `event` — how urgently to
 * announce it. A `condition` uses the icon and ignores the role.
 */
const TONE_META = {
  error: { Icon: AlertCircle, role: 'alert' },
  success: { Icon: CheckCircle2, role: 'status' },
  info: { Icon: Info, role: 'status' },
} as const;

export type AlertTone = keyof typeof TONE_META;

/** See {@link AlertProps.purpose}. Two values, because there are two cases and not a spectrum. */
export type AlertPurpose = 'event' | 'condition';

export interface AlertProps
  extends Omit<React.HTMLAttributes<HTMLDivElement>, 'role'>, VariantProps<typeof alertVariants> {
  /**
   * Whether this reports something that just happened, or states a condition that was already true.
   * **Required, with no default** — see the docblock above. `'event'` renders the tone's live role;
   * `'condition'` renders no `role` at all and keeps the tone's icon and colour.
   */
  purpose: AlertPurpose;
  tone?: AlertTone;
}

export const Alert = forwardRef<HTMLDivElement, AlertProps>(function Alert(
  { purpose, tone = 'error', className, children, ...props },
  ref,
) {
  // `Icon` is unconditional: `tone` keeps owning the icon and the colour whatever the purpose is.
  // The role is spread rather than passed as `role={…}` so a `condition` renders **no attribute**,
  // not `role={undefined}` — the two look the same in React and only the first is what a census
  // over the rendered DOM can assert.
  const { Icon, role } = TONE_META[tone];

  return (
    <div
      ref={ref}
      {...(purpose === 'event' ? { role } : {})}
      className={cn(alertVariants({ tone }), className)}
      {...props}
    >
      {/* `aria-hidden`: the icon repeats what the role and the sentence already carry, and a
          screen-reader user reaching this region does not need "alert, image, alert". `mt-0.5`
          rather than `items-center`, so a two-line message keeps the icon beside its FIRST line
          instead of floating to the middle of the block. */}
      <Icon aria-hidden="true" className="mt-0.5 size-4 shrink-0" />
      <div className="min-w-0 flex-1">{children}</div>
    </div>
  );
});
