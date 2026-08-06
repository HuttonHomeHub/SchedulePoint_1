import { useEffect, useRef } from 'react';

/**
 * Move focus into a state that has just **replaced** the control the reader was using
 * (ADR-0074 M5-T1, accessibility review).
 *
 * Three forms in the recovery flow swap their whole `<form>` for an outcome — sign-in's unverified
 * branch, the reset request's "check your email", the reset's "password changed". In each, the
 * just-clicked submit button is **unmounted**, so focus falls to `<body>`: the visible focus ring
 * vanishes and a keyboard user is returned to the top of the document with no indication of where
 * the outcome went. That is the WCAG 2.4.3 failure this codebase has already treated as blocking
 * twice (ADR-0064's split-button caret, ADR-0060 M6's Save button).
 *
 * The resend button was a fourth until ADR-0077 M1-T1, which stopped it unmounting its own form —
 * it still uses this hook, because the outcome is the new information on the screen whether or not
 * the control survived. Recorded rather than left as "four": a docblock describing behaviour that
 * has been corrected is how the ADR-0066 exporter defect stayed alive for months.
 *
 * Attach the returned ref to the outcome container and give it `tabIndex={-1}`; it takes focus
 * once, when `active` first becomes true. Once, not on every render — refocusing on a later render
 * would yank the reader back out of whatever they had moved on to.
 *
 * A hook rather than four copies because this fires at exactly the moment a component stops
 * rendering the thing it was rendering, which is the hardest moment to notice missing — and four
 * hand-written effects would have drifted on the "once" part first.
 */
export function useOutcomeFocus<T extends HTMLElement>(active: boolean): React.RefObject<T | null> {
  const ref = useRef<T>(null);
  const moved = useRef(false);

  useEffect(() => {
    if (!active) {
      // Reset so a form that returns to its input state and resolves again focuses the new outcome.
      moved.current = false;
      return;
    }
    if (moved.current) return;
    moved.current = true;
    ref.current?.focus();
  }, [active]);

  return ref;
}
