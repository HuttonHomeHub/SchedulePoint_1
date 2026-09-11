import { useCallback, useLayoutEffect, useRef } from 'react';

import { useAnnounce } from '@/components/ui/announcer';

/**
 * **A roving container hands focus back to itself when something OTHER than the reader removes the
 * control they were standing on.** Shared by {@link Toolbar} and {@link Deck} for the reason
 * `toolbar-keyboard.ts` exists: two copies of a keyboard rule drift the moment one is fixed, and
 * this repository has recorded that shape in five consecutive epics.
 *
 * ## The defect, measured rather than reasoned
 *
 * `docs/TECH_DEBT.md` #204(c). A toolbar item can leave because of a **peer's** write — the
 * canonical case is `Clear visual start`, whose `isVisible` is literally
 * `schedulingMode === 'VISUAL'`, and `schedulingMode` is a plan-level setting another Planner can
 * change while holding no pen. The reader's next refetch unmounts the control under whatever focus
 * is on it, and focus lands on `<body>`: WCAG 2.2 §2.4.3, level A, and on the plan workspace it
 * also silently disables every keyboard accelerator, which are React handlers on the workspace
 * root.
 *
 * Both halves are observations, not inferences (`docs/specs/unmount-focus-handoff/m0-measurement.md`):
 * the two-context probe reports `focusAfter: BODY` with the **bar still present**, and a separate
 * Chromium probe reports `document.activeElement` as `BODY` inside the layout effect of the commit
 * that removed the node, and still `BODY` one frame later.
 *
 * ## What this hook does NOT decide, and why each one matters
 *
 * - **It does not know WHY an item went.** The reason is static registry data (`lostReason`), not
 *   anything derivable here. A reason computed at focus time would describe the world before the
 *   change; one computed after removal has no item left to compute against.
 * - **It does not fire when the CONTAINER unmounts.** An effect body cannot run in a commit where
 *   the component unmounted, so this and `SelectionActionsBar`'s whole-bar `restoreFocus` cleanup
 *   (`selection-actions.tsx:953-962`) are mutually exclusive by construction rather than by care.
 *   That cleanup stays exactly as it is: its container ref is already detached when it runs, which
 *   is why it tracks a boolean and hands focus to a caller-supplied destination; here the ref is
 *   live, which is what makes focusing the container possible at all.
 * - **It yields to anything else that moves focus.** One animation frame, then act only if focus
 *   was still dropped. This is what stops it becoming a fifth answer to a question the product
 *   already answers four times — a dialog, a menu's focus return, the listbox handoff after a bulk
 *   delete, and the cleanup above have all had their chance by then.
 *
 * ## Why the record is an ELEMENT and not an id
 *
 * Comparing id lists would miss a {@link ToolbarSplitButton} **caret**, which is a sibling of the
 * element carrying `data-toolbar-item` and is deliberately `tabIndex={-1}` — exactly the control
 * class ADR-0110 D5 records a gate shipping blind to, under a docblock claiming it covered both
 * halves. Recording the focused element and asking `!container.contains(recorded)` covers every
 * focusable the container can ever hold, including ones no registry field describes.
 *
 * ## Order: focus, then announce
 *
 * Product-owner decision, on a measurement. `AnnouncerProvider.announce` clears the region and sets
 * the message inside a `requestAnimationFrame` (`announcer.tsx:16-19`), so a synchronous `focus()`
 * fired after `announce()` lands **before** the message exists and the screen reader reads the
 * newly-focused container over it. Focusing first and announcing in the same frame is the only
 * order that reliably speaks both — and the announcement is emitted **only if focus actually
 * landed**, so a sentence can never describe a move that did not happen.
 */

/** Spread on the container. Two capture handlers and nothing else. */
export interface ToolbarFocusHandoffHandlers {
  onFocusCapture: (event: React.FocusEvent<HTMLElement>) => void;
  onBlurCapture: (event: React.FocusEvent<HTMLElement>) => void;
}

export interface ToolbarFocusHandoffOptions {
  /** The `role="toolbar"` element. Must carry `tabIndex={-1}` so it can receive focus. */
  containerRef: React.RefObject<HTMLElement | null>;
  /**
   * The ids the container currently renders as roving stops. Only its **identity** is used — the
   * hook re-checks containment whenever this changes, which is the commit an item could have left
   * in.
   */
  resolvedIds: readonly string[];
  /** The container's accessible name, used verbatim in the sentence. */
  toolbarLabel: string;
  /**
   * `lostReason` for an item id, if the registry declares one. Optional by decision: roughly forty
   * registry items would each need a sentence written before anything could ship, and a rushed
   * sentence is worse than a generic one. A development-only warning marks the gaps.
   */
  lostReasonFor?: (itemId: string) => string | undefined;
}

/**
 * What was focused, which registry item it belonged to, and — **captured at focus time** — the two
 * strings the message needs.
 *
 * **This is a correction to `feature-spec.md` §4.6, found by writing it.** That section has the
 * hook calling `lostReasonFor` when it acts. It cannot: by then the item has left the resolved set,
 * which is the entire premise of the hook, so the lookup would be against a list that no longer
 * contains it. Both strings are therefore read while the item is still there. That is also why
 * `lostReason` being **static** is load-bearing rather than stylistic — a value read in the old
 * world has to still be true in the new one.
 */
interface FocusRecord {
  element: Element;
  itemId: string | null;
  itemLabel: string | null;
  lostReason: string | undefined;
}

const warnedMissingReason = new Set<string>();

/**
 * Development-only, once per item id, non-throwing — the `warnRefusedPartition` shape
 * (`Toolbar.tsx:89-98`). A missing `lostReason` still produces a correct, if less specific,
 * announcement, so failing the build over it would be worse than the gap.
 */
function warnMissingLostReason(itemId: string): void {
  if (!import.meta.env.DEV || warnedMissingReason.has(itemId)) return;
  warnedMissingReason.add(itemId);
  console.warn(
    `Toolbar: item "${itemId}" was removed while it held focus and declares no \`lostReason\`, so ` +
      'the reader is told what left but not why. Add a static `lostReason` to the registry item — ' +
      'a sentence describing the CONDITION, true both before and after the change.',
  );
}

/**
 * The element an item's focusable belongs to, for attribution. `data-toolbar-item` is on the
 * focusable itself; `data-toolbar-item-scope` is on the wrapper around a `render` item, which is
 * what attributes a split-button caret to its item.
 */
function itemIdOf(element: Element): string | null {
  const owner = element.closest('[data-toolbar-item],[data-toolbar-item-scope]');
  if (!owner) return null;
  return (
    owner.getAttribute('data-toolbar-item') ?? owner.getAttribute('data-toolbar-item-scope') ?? null
  );
}

/**
 * The name the reader heard when they focused the control, read from the DOM rather than looked up.
 *
 * It has to come from the DOM: the registry's `label` is on the item, and by the time this is
 * needed the item is gone. The accessible name is also the more honest string — it is what was
 * announced on focus, so the sentence names the same thing the reader was last told about.
 *
 * **The two-step lookup is the split-button caret's doing, found by the test rather than designed.**
 * A caret is a SIBLING of the element carrying `data-toolbar-item`, so `closest` from it reaches the
 * `[data-toolbar-item-scope]` wrapper — whose `textContent` is the primary button's label with the
 * caret's own glyph appended (`"Add▾"`). Naming the item's focusable inside that scope gives the
 * name the reader actually heard.
 */
function labelOf(element: Element): string | null {
  const direct = element.closest('[data-toolbar-item]');
  const scope = direct ?? element.closest('[data-toolbar-item-scope]');
  const named = direct ?? scope?.querySelector('[data-toolbar-item]') ?? scope ?? element;
  const label = named.getAttribute('aria-label') ?? named.textContent ?? '';
  const trimmed = label.trim();
  return trimmed === '' ? null : trimmed.slice(0, 80);
}

/**
 * The two sentence forms, as one pure function so both can be asserted without a DOM.
 *
 * The reason is a **condition**, so it reads as one: "… is no longer available: this action applies
 * only while the plan is scheduled in Visual mode." Without a reason the reader is still told what
 * left and where they now are, which is the whole WCAG 2.4.3 obligation; the reason is the part
 * that turns a correct announcement into a useful one.
 */
export function composeHandoffMessage({
  itemLabel,
  lostReason,
  toolbarLabel,
}: {
  itemLabel: string | null;
  lostReason: string | undefined;
  toolbarLabel: string;
}): string {
  const subject = itemLabel === null ? 'The control you were on' : itemLabel;
  const why = lostReason === undefined ? '' : ` ${lostReason}`;
  return `${subject} is no longer available.${why} Focus moved to ${toolbarLabel}.`;
}

export function useToolbarFocusHandoff({
  containerRef,
  resolvedIds,
  toolbarLabel,
  lostReasonFor,
}: ToolbarFocusHandoffOptions): ToolbarFocusHandoffHandlers {
  const announce = useAnnounce();
  const recordRef = useRef<FocusRecord | null>(null);

  const onFocusCapture = useCallback(
    (event: React.FocusEvent<HTMLElement>) => {
      const target = event.target;
      const container = containerRef.current;
      // **Containment is checked at RECORD time, not only at check time.** React's `onFocus` fires
      // for PORTALLED descendants too — a `Menu`, a `Combobox` — whose nodes are legitimately
      // outside the container and would otherwise read as "removed" on the very frame they were
      // focused.
      if (!container || target === container || !container.contains(target)) return;
      const itemId = itemIdOf(target);
      recordRef.current = {
        element: target,
        itemId,
        itemLabel: labelOf(target),
        lostReason: itemId === null ? undefined : lostReasonFor?.(itemId),
      };
    },
    [containerRef, lostReasonFor],
  );

  const onBlurCapture = useCallback((event: React.FocusEvent<HTMLElement>) => {
    // **Only a real move to another element clears the record.** When an item is being REMOVED the
    // browser blurs it with no related target, and that is exactly the case the handoff must still
    // see as "we had focus". Copied by value from `selection-actions.tsx:971-977`, whose comment
    // records the same rule, so the two cannot come to mean different things.
    if (event.relatedTarget !== null) recordRef.current = null;
  }, []);

  useLayoutEffect(() => {
    const record = recordRef.current;
    const container = containerRef.current;
    if (!record || !container) return;
    // Still there — the commit changed something else.
    if (container.contains(record.element)) return;

    // The record is consumed here, whatever happens next, so one removal produces at most one
    // handoff even when two items leave in the same commit.
    recordRef.current = null;
    const { itemId, itemLabel, lostReason } = record;

    // **No cleanup cancels this frame, deliberately.** A cleanup would fire on every change to
    // `resolvedIds`, so two commits landing back to back would cancel the first one's handoff and
    // the second would not re-schedule — the record is already consumed. The frame guards itself
    // instead: on unmount React nulls the ref, so `containerRef.current` is `null` and it returns.
    requestAnimationFrame(() => {
      // **The yield's whole purpose**: by now anything else that was going to move focus has. The
      // guard is the existing one, by value (`selection-actions.tsx:958-959`), so "focus was
      // dropped" cannot come to mean two things.
      const active = document.activeElement;
      if (active !== null && active !== document.body) return;

      const target = containerRef.current;
      if (!target) return;
      target.focus();
      // Only if focus actually landed. A sentence describing a move that did not happen is worse
      // than silence.
      if (document.activeElement !== target) return;

      if (itemId !== null && lostReason === undefined) warnMissingLostReason(itemId);
      announce(composeHandoffMessage({ itemLabel, lostReason, toolbarLabel }));
    });
    // `resolvedIds` is the TRIGGER, not an input: the commit in which an item could have left is
    // the commit in which this list changed, and nothing in the body reads it. It must therefore be
    // referentially stable at the call site — both primitives already memoise theirs — or this runs
    // every render, which is harmless (no record, or the record is still contained) but wasteful.
  }, [resolvedIds, containerRef, toolbarLabel, announce]);

  return { onFocusCapture, onBlurCapture };
}
