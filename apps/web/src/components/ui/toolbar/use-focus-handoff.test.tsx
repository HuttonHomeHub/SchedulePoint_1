import { render, screen } from '@testing-library/react';
import { useRef } from 'react';
import { createPortal } from 'react-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { composeHandoffMessage, useToolbarFocusHandoff } from './use-focus-handoff';

const announceSpy = vi.fn();
vi.mock('@/components/ui/announcer', () => ({ useAnnounce: () => announceSpy }));

/**
 * **The decision table for `useToolbarFocusHandoff`, every branch verified red.**
 *
 * Each case below names the mutation it was made to fail against; all were run against the hook
 * with that line removed before being wired. A suite that passes against a hook which never fires
 * would be worse than none — it would say the rule is covered while the product had no rule.
 *
 * ## Why the hook is driven through a local harness and not through `Toolbar`/`Deck`
 *
 * **A deliberate departure from `implementation-plan.md` M1-T2, recorded rather than done
 * quietly.** That task's table drives the cases "through both `Toolbar` and `Deck`" — which cannot
 * be done in M1, because M1's own definition is that the hook ships **dark** and neither primitive
 * calls it yet. Mounting them here would mean adopting them here, collapsing M1 into M2 and losing
 * the commit boundary that is this change's only rollback (ADR-0088 D1 — a `VITE_` flag is inlined
 * at build time and is not an operator rollback).
 *
 * So M1 proves the **rule**, on a harness that reproduces the one thing the primitives supply: a
 * `role="toolbar"` container holding items marked with `data-toolbar-item`. M2 proves the
 * **adoption**, against the real primitives. What the harness cannot say is whether `Toolbar` and
 * `Deck` pass the right `resolvedIds`; that is M2's job and M1-T3's structural test.
 *
 * ## jsdom's limits, stated rather than assumed
 *
 * jsdom has no layout and no real focus ring, but it does implement `document.activeElement`,
 * `Node.contains` and blur-on-removal — which is exactly the set this rule is made of. What it
 * cannot say is the commit-ordering claim the rule rests on (answered in Chromium at M0,
 * `docs/specs/unmount-focus-handoff/m0-measurement.md`) or whether a screen reader speaks the
 * container's name before the polite sentence (owed to a person, `docs/TECH_DEBT.md` #154).
 */

/** Frames are flushed by hand, so "somebody else took focus during the yield" is expressible. */
let frames: FrameRequestCallback[] = [];
function flushFrames(): void {
  const queued = frames;
  frames = [];
  for (const cb of queued) cb(0);
}

beforeEach(() => {
  announceSpy.mockClear();
  frames = [];
  vi.stubGlobal('requestAnimationFrame', (cb: FrameRequestCallback): number => {
    frames.push(cb);
    return frames.length;
  });
  vi.stubGlobal('cancelAnimationFrame', () => undefined);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

interface HarnessProps {
  /** Which item ids the container currently renders. */
  ids: readonly string[];
  lostReasonFor?: (id: string) => string | undefined;
  /** Render a split button, so a caret (a `tabIndex={-1}` sibling) can be focused. */
  splitButton?: boolean;
  /**
   * Render a child through a React PORTAL. Its DOM node is outside the container while its React
   * node is inside, so `onFocusCapture` fires for it — which is the whole hazard.
   */
  portalled?: boolean;
}

/**
 * The minimum a container has to be for the rule to apply: a named `role="toolbar"` that can hold
 * focus, with the hook's two capture handlers spread on it and items marked the way both primitives
 * mark theirs.
 */
function Harness({
  ids,
  lostReasonFor,
  splitButton = false,
  portalled = false,
}: HarnessProps): React.ReactElement {
  const containerRef = useRef<HTMLDivElement>(null);
  const handlers = useToolbarFocusHandoff({
    containerRef,
    resolvedIds: ids,
    toolbarLabel: 'Actions for Excavate',
    ...(lostReasonFor ? { lostReasonFor } : {}),
  });
  return (
    <div
      ref={containerRef}
      role="toolbar"
      aria-label="Actions for Excavate"
      tabIndex={-1}
      {...handlers}
    >
      {ids.map((id) => (
        <button key={id} type="button" data-toolbar-item={id} aria-label={id}>
          {id}
        </button>
      ))}
      {portalled
        ? createPortal(
            <button type="button" aria-label="Menu option">
              Menu option
            </button>,
            document.body,
          )
        : null}
      {splitButton ? (
        <span data-toolbar-item-scope="split">
          <button type="button" data-toolbar-item="split" aria-label="Add">
            Add
          </button>
          <button type="button" tabIndex={-1} aria-label="More Add options">
            ▾
          </button>
        </span>
      ) : null}
    </div>
  );
}

function toolbar(): HTMLElement {
  return screen.getByRole('toolbar', { name: 'Actions for Excavate' });
}

describe('useToolbarFocusHandoff — it fires', () => {
  it('hands focus to the container when the focused item leaves and nothing caught it', () => {
    // Verified red by removing the `target.focus()` call: focus stays on `<body>`.
    const { rerender } = render(<Harness ids={['clear', 'edit']} />);
    screen.getByRole('button', { name: 'clear' }).focus();

    rerender(<Harness ids={['edit']} />);
    expect(document.activeElement).toBe(document.body);

    flushFrames();
    expect(document.activeElement).toBe(toolbar());
  });

  it('fires when EVERY item leaves, not only some of them', () => {
    // Verified red by early-returning on an empty resolved list — the shape a "nothing to focus"
    // guard would take, and the case where the reader is most stranded.
    const { rerender } = render(<Harness ids={['clear']} />);
    screen.getByRole('button', { name: 'clear' }).focus();

    rerender(<Harness ids={[]} />);
    flushFrames();

    expect(document.activeElement).toBe(toolbar());
  });

  it('announces AFTER focus lands, and last', () => {
    // F5. Verified red by swapping the two calls: `announce` then runs while `activeElement` is
    // still `<body>`, which is the ordering `announcer.tsx`'s deferred write makes inaudible.
    const { rerender } = render(<Harness ids={['clear', 'edit']} />);
    screen.getByRole('button', { name: 'clear' }).focus();
    rerender(<Harness ids={['edit']} />);

    announceSpy.mockImplementation(() => {
      // Read at the moment the announcement is made, which is the only place the order is visible.
      expect(document.activeElement).toBe(toolbar());
    });
    flushFrames();

    expect(announceSpy).toHaveBeenCalledTimes(1);
  });

  it('produces ONE handoff even when the effect runs again before the frame does', () => {
    // E6 — **and this case does not isolate the record-clear, which is recorded rather than
    // claimed.** Omitting `recordRef.current = null` leaves the suite green (measured): the second
    // commit does schedule a second frame, but by the time it runs the container already has focus,
    // so the `activeElement` guard turns it away. The guard is the load-bearing rule; the clear is
    // defence in depth, and keeping it means one removal can never *schedule* more than one
    // handoff. What this case does prove is the property the reader cares about — two items leaving
    // produces exactly one announcement — which is true, for two independent reasons.
    const { rerender } = render(<Harness ids={['clear', 'edit', 'delete']} />);
    screen.getByRole('button', { name: 'clear' }).focus();

    rerender(<Harness ids={['edit', 'delete']} />); // the item leaves
    rerender(<Harness ids={['delete']} />); // another commit, before any frame has run
    flushFrames();

    expect(announceSpy).toHaveBeenCalledTimes(1);
  });
});

describe('useToolbarFocusHandoff — it does not fire', () => {
  it('stands down when something else already took focus', () => {
    // Verified red by removing the `activeElement` guard: the hook then yanks focus out of the
    // dialog that legitimately claimed it.
    const { rerender } = render(<Harness ids={['clear', 'edit']} />);
    const elsewhere = document.createElement('button');
    document.body.append(elsewhere);

    screen.getByRole('button', { name: 'clear' }).focus();
    rerender(<Harness ids={['edit']} />);
    // Between the commit and the frame, somebody else answers — which is what the yield is for.
    elsewhere.focus();
    flushFrames();

    expect(document.activeElement).toBe(elsewhere);
    expect(announceSpy).not.toHaveBeenCalled();
    elsewhere.remove();
  });

  it('does nothing when an item the reader was NOT on leaves', () => {
    const { rerender } = render(<Harness ids={['clear', 'edit']} />);
    const clear = screen.getByRole('button', { name: 'clear' });
    clear.focus();

    rerender(<Harness ids={['clear']} />);
    flushFrames();

    expect(document.activeElement).toBe(clear);
    expect(announceSpy).not.toHaveBeenCalled();
  });

  it('does not yank back a reader who blurred to nothing and then watched an item leave', () => {
    // **The containment check at CHECK time, and the only case that isolates it.** The obvious
    // test — "an item the reader was not on leaves" — does not: the `activeElement` guard catches
    // that one first, so removing the containment check leaves it green (measured).
    //
    // This is the shape that reaches past the guard. The reader blurs to nothing — clicking empty
    // background, which blurs with NO related target, so the record is deliberately kept — and
    // then an unrelated item leaves. `activeElement` is now `<body>`, so the guard says yes, and
    // only the containment check knows the recorded element is still sitting in the container and
    // the reader chose to leave it.
    //
    // Verified red by removing `if (container.contains(record.element)) return;`.
    const { rerender } = render(<Harness ids={['clear', 'edit']} />);
    const clear = screen.getByRole('button', { name: 'clear' });
    clear.focus();
    clear.blur();
    expect(document.activeElement).toBe(document.body);

    rerender(<Harness ids={['clear']} />);
    flushFrames();

    expect(document.activeElement).toBe(document.body);
    expect(announceSpy).not.toHaveBeenCalled();
  });

  it('does nothing when the reader moved focus away themselves first', () => {
    // The blur rule. Verified red by clearing the record on EVERY blur — which also breaks the
    // firing case, because a removal blurs with no related target.
    const { rerender } = render(<Harness ids={['clear', 'edit']} />);
    const elsewhere = document.createElement('button');
    document.body.append(elsewhere);

    screen.getByRole('button', { name: 'clear' }).focus();
    elsewhere.focus(); // a real move, with a related target
    rerender(<Harness ids={['edit']} />);
    flushFrames();

    expect(document.activeElement).toBe(elsewhere);
    expect(announceSpy).not.toHaveBeenCalled();
    elsewhere.remove();
  });

  it('does not fire when the container itself unmounts', () => {
    // E4/W3. Verified red by moving the logic into a layout-effect CLEANUP, which is where the
    // obvious implementation puts it — and which is `SelectionActionsBar`'s mechanism, not this
    // one. The two are mutually exclusive by construction and must stay that way.
    const { unmount } = render(<Harness ids={['clear']} />);
    screen.getByRole('button', { name: 'clear' }).focus();

    unmount();
    flushFrames();

    expect(announceSpy).not.toHaveBeenCalled();
  });

  it('ignores focus on a node outside the container (a portalled Menu or Combobox)', () => {
    // **A real `createPortal`, because nothing less reproduces the hazard.** A portal's DOM node is
    // outside the container while its React node is inside, so `onFocusCapture` DOES fire for it
    // and `container.contains()` says no.
    //
    // The discriminating shape is the portal CLOSING, and finding it took two wrong versions.
    // Version 1 appended a detached `<button>` and dispatched `focusin` at the container: the
    // event's target was the container itself, which an earlier branch rejects, so the guard under
    // test never ran. Version 2 used a real portal but left it open, and the `activeElement` guard
    // masked the mutation — focus was still on the portalled node, so nothing fired either way.
    //
    // With the portal gone, focus really is on `<body>` and only the record-time guard stands
    // between the reader and a handoff. It must stand: a `Menu` returns focus to its own trigger,
    // and a toolbar that also grabs it is the fifth answer this hook exists not to be.
    //
    // Verified red by removing `!container.contains(target)` from the record-time guard.
    const { rerender } = render(<Harness ids={['clear']} portalled />);
    screen.getByRole('button', { name: 'Menu option' }).focus();

    rerender(<Harness ids={['clear']} />);
    expect(document.activeElement).toBe(document.body);
    flushFrames();

    expect(announceSpy).not.toHaveBeenCalled();
    expect(document.activeElement).toBe(document.body);
  });

  it('cannot discriminate the blur rule, and that is jsdom rather than the rule', () => {
    // **Recorded rather than claimed.** The hook clears its record only for a blur carrying a
    // related target, because in a real browser a REMOVAL blurs with none — the case the handoff
    // must still see as "we had focus". Mutating that to clear on every blur leaves this suite
    // green, and the reason is measured: in jsdom, removing the focused node sets `activeElement`
    // to `BODY` and dispatches **no blur event at all** (probed directly — `blurCalls=0`,
    // `activeElement=BODY`). There is no blur for the mutation to mishandle.
    //
    // So the rule is covered by the journey, against a real browser, and not here. What this case
    // pins is the half jsdom CAN see: a blur with a related target really does clear the record,
    // which is what stops a reader who moved on being yanked back. Verified red by never clearing.
    const { rerender } = render(<Harness ids={['clear', 'edit']} />);
    const elsewhere = document.createElement('button');
    document.body.append(elsewhere);

    screen.getByRole('button', { name: 'clear' }).focus();
    elsewhere.focus();
    rerender(<Harness ids={['edit']} />);
    flushFrames();

    expect(announceSpy).not.toHaveBeenCalled();
    elsewhere.remove();
  });
});

describe('useToolbarFocusHandoff — what it says', () => {
  it('names the control, the reason and the destination when a reason is declared', () => {
    const { rerender } = render(
      <Harness
        ids={['clear', 'edit']}
        lostReasonFor={(id) =>
          id === 'clear'
            ? 'This action applies only while the plan is scheduled in Visual mode.'
            : undefined
        }
      />,
    );
    screen.getByRole('button', { name: 'clear' }).focus();
    rerender(
      <Harness
        ids={['edit']}
        lostReasonFor={(id) =>
          id === 'clear'
            ? 'This action applies only while the plan is scheduled in Visual mode.'
            : undefined
        }
      />,
    );
    flushFrames();

    expect(announceSpy).toHaveBeenLastCalledWith(
      'clear is no longer available. This action applies only while the plan is scheduled in ' +
        'Visual mode. Focus moved to Actions for Excavate.',
    );
  });

  it('still names the control and the destination when no reason is declared', () => {
    // The `lostReason`-optional decision. The reader is always told what left and where they are;
    // the reason is what makes that useful rather than merely correct.
    const { rerender } = render(<Harness ids={['clear', 'edit']} />);
    screen.getByRole('button', { name: 'clear' }).focus();
    rerender(<Harness ids={['edit']} />);
    flushFrames();

    expect(announceSpy).toHaveBeenLastCalledWith(
      'clear is no longer available. Focus moved to Actions for Excavate.',
    );
  });

  it('reads the reason at FOCUS time, not when it acts', () => {
    // The §4.6 correction, pinned. A lookup made when the hook acts is against a resolved set the
    // item has by then left — which is the hook's entire premise — so it would always miss.
    // Verified red by moving the `lostReasonFor` call into the frame.
    const reasons = new Map([['clear', 'Only in Visual mode.']]);
    const lookup = (id: string): string | undefined => reasons.get(id);

    const { rerender } = render(<Harness ids={['clear']} lostReasonFor={lookup} />);
    screen.getByRole('button', { name: 'clear' }).focus();
    // The item leaves the registry entirely — exactly what a lookup made later would face.
    reasons.delete('clear');
    rerender(<Harness ids={[]} lostReasonFor={lookup} />);
    flushFrames();

    expect(announceSpy).toHaveBeenLastCalledWith(
      'clear is no longer available. Only in Visual mode. Focus moved to Actions for Excavate.',
    );
  });

  it('attributes a split-button caret to its item rather than to itself', () => {
    // `data-toolbar-item-scope`. The caret is a SIBLING of the element carrying
    // `data-toolbar-item` and is `tabIndex={-1}` — the control class ADR-0110 D5 records a gate
    // shipping blind to. Verified red by dropping `[data-toolbar-item-scope]` from the selector.
    const { rerender } = render(<Harness ids={['edit']} splitButton />);
    screen.getByRole('button', { name: 'More Add options' }).focus();

    rerender(<Harness ids={['edit']} />);
    flushFrames();

    expect(announceSpy).toHaveBeenLastCalledWith(
      'Add is no longer available. Focus moved to Actions for Excavate.',
    );
  });
});

describe('composeHandoffMessage', () => {
  it('degrades to a truthful sentence when the control had no readable name', () => {
    expect(
      composeHandoffMessage({
        itemLabel: null,
        lostReason: undefined,
        toolbarLabel: 'Plan commands',
      }),
    ).toBe('The control you were on is no longer available. Focus moved to Plan commands.');
  });
});
