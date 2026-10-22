import { act, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  TOOLTIP_CLOSE_GRACE_MS,
  TOOLTIP_LONG_PRESS_MS,
  TOOLTIP_OPEN_DELAY_MS,
  useTooltip,
  type TooltipOptions,
} from './tooltip';

/**
 * The Tooltip primitive's contract (fix-slice M-B, ADR-0117) — one case per WCAG 1.4.13 clause,
 * plus the `purpose` wiring, the Escape ladder condition, the one-open token and the long-press
 * grammar. Every case was verified red against a deliberately broken variant before being
 * trusted (the break named beside the case). jsdom has no layout or real hover, so the cases
 * assert the MECHANISM (state, timers, ARIA wiring, `defaultPrevented`) — the flag-on journey in
 * `e2e-toolbar` is the instrument that sees the outcome.
 */
function Host({
  onCommand,
  ...options
}: Partial<TooltipOptions> & { onCommand?: () => void }): React.ReactElement {
  // `in`, not `??`: the empty-content case passes `content={undefined}` deliberately, and a
  // nullish default would silently swap the subject back in (this harness shipped that first).
  const { triggerProps, tooltip, show } = useTooltip({
    content: 'content' in options ? options.content : 'Zoom in',
    purpose: options.purpose ?? 'name-echo',
    disabled: options.disabled,
    ...(options.placement ? { placement: options.placement } : {}),
    ...(options.dismissOnPress ? { dismissOnPress: options.dismissOnPress } : {}),
    ...(options.opensOn ? { opensOn: options.opensOn } : {}),
  });
  return (
    <>
      <button {...triggerProps} aria-label="Zoom in" onClick={onCommand}>
        +
      </button>
      {options.opensOn ? (
        <button type="button" onClick={show}>
          ask
        </button>
      ) : null}
      {tooltip}
    </>
  );
}

const tip = (): HTMLElement | null => document.querySelector('[data-tooltip]');

describe('useTooltip', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => {
    vi.runOnlyPendingTimers();
    vi.useRealTimers();
  });

  it('opens on hover after the delay, not before (red: delay removed)', () => {
    render(<Host />);
    fireEvent.pointerEnter(screen.getByRole('button'), { pointerType: 'mouse' });
    expect(tip()).toBeNull();
    act(() => void vi.advanceTimersByTime(TOOLTIP_OPEN_DELAY_MS));
    expect(tip()).not.toBeNull();
    expect(tip()).toHaveTextContent('Zoom in');
  });

  it('opens on focus immediately — focus is deliberate (red: focus routed through the delay)', () => {
    render(<Host />);
    fireEvent.focus(screen.getByRole('button'));
    expect(tip()).not.toBeNull();
  });

  it('1.4.13 Hoverable: pointer-leave closes only after the grace, and entering the tip cancels it', () => {
    render(<Host />);
    fireEvent.focus(screen.getByRole('button'));
    const node = tip();
    if (!node) throw new Error('tooltip did not open');
    fireEvent.pointerLeave(screen.getByRole('button'), { pointerType: 'mouse' });
    expect(tip()).not.toBeNull(); // still open inside the grace
    fireEvent.pointerEnter(node); // pointer crossed ONTO the tooltip
    act(() => void vi.advanceTimersByTime(TOOLTIP_CLOSE_GRACE_MS + 50));
    expect(tip()).not.toBeNull(); // the crossing kept it open
    fireEvent.pointerLeave(node);
    act(() => void vi.advanceTimersByTime(TOOLTIP_CLOSE_GRACE_MS));
    expect(tip()).toBeNull();
  });

  it('1.4.13 Persistent: it never closes on a timer while hovered', () => {
    render(<Host />);
    fireEvent.focus(screen.getByRole('button'));
    act(() => void vi.advanceTimersByTime(60_000));
    expect(tip()).not.toBeNull();
  });

  it('1.4.13 Dismissible: Escape closes it, prevents the default, and moves no focus (red: preventDefault removed)', () => {
    render(<Host />);
    const button = screen.getByRole('button');
    button.focus();
    fireEvent.focus(button);
    expect(tip()).not.toBeNull();
    const notPrevented = fireEvent.keyDown(document, { key: 'Escape' });
    expect(notPrevented).toBe(false); // preventDefault fired — an enclosing dialog stays open
    expect(tip()).toBeNull();
    expect(document.activeElement).toBe(button); // focus unmoved
  });

  it('claims Escape ONLY while open — the ADR-0080 ladder condition (red: listener registered unconditionally)', () => {
    render(<Host />);
    const notPrevented = fireEvent.keyDown(document, { key: 'Escape' });
    expect(notPrevented).toBe(true); // nothing open ⇒ the key belongs to the rung above
  });

  it('an open tooltip never withholds Escape from window-level rungs (red: stopPropagation re-added)', () => {
    // The M-B accessibility review's blocking finding: a document-capture stopPropagation
    // pre-empted the canvas's window listener (tool disarm, marquee clear) whenever a tooltip
    // happened to be open from an incidental hover. The contract is preventDefault WITHOUT
    // stopPropagation: the press closes the tooltip AND still reaches the rung it was aimed at.
    const windowRung = vi.fn();
    window.addEventListener('keydown', windowRung);
    try {
      render(<Host />);
      fireEvent.focus(screen.getByRole('button'));
      expect(tip()).not.toBeNull();
      const notPrevented = fireEvent.keyDown(document, { key: 'Escape' });
      expect(notPrevented).toBe(false); // the tooltip claims the press for defaultPrevented rungs
      expect(windowRung).toHaveBeenCalledTimes(1); // …and the window rung still received it
      expect(tip()).toBeNull();
    } finally {
      window.removeEventListener('keydown', windowRung);
    }
  });

  it('a pointer press outside trigger and tip dismisses it — touch has no Escape', () => {
    render(<Host />);
    fireEvent.focus(screen.getByRole('button'));
    expect(tip()).not.toBeNull();
    fireEvent.pointerDown(document.body);
    expect(tip()).toBeNull();
  });

  it('a pen takes the hover path only: a pen press never arms the click suppression', () => {
    // Review finding 4: pen in BOTH paths opened a 400–500 ms window where the hover path had
    // shown the tooltip while the suppression was not yet armed — name shown AND command fired.
    const onCommand = vi.fn();
    render(<Host onCommand={onCommand} />);
    const button = screen.getByRole('button');
    fireEvent.pointerDown(button, { pointerType: 'pen', clientX: 10, clientY: 10 });
    act(() => void vi.advanceTimersByTime(TOOLTIP_LONG_PRESS_MS + 100));
    fireEvent.pointerUp(button, { pointerType: 'pen' });
    fireEvent.click(button);
    expect(onCommand).toHaveBeenCalledTimes(1); // the command fired — no touch grammar for pen
  });

  it("purpose 'name-echo': the tip is aria-hidden and the trigger gains NO aria-describedby (red: linked anyway)", () => {
    render(<Host purpose="name-echo" />);
    fireEvent.focus(screen.getByRole('button'));
    expect(tip()).toHaveAttribute('aria-hidden', 'true');
    expect(tip()).not.toHaveAttribute('role');
    expect(screen.getByRole('button')).not.toHaveAttribute('aria-describedby');
  });

  it("purpose 'reason-echo': aria-hidden, no describedby, opens on focus (red: linked anyway)", () => {
    render(<Host purpose="reason-echo" content="Start editing to change this." />);
    fireEvent.focus(screen.getByRole('button'));
    expect(tip()).toHaveAttribute('aria-hidden', 'true');
    expect(tip()).not.toHaveAttribute('role');
    expect(tip()).toHaveTextContent('Start editing to change this.');
    expect(screen.getByRole('button')).not.toHaveAttribute('aria-describedby');
  });

  describe("purpose 'reason-echo' opens on a press (ADR-0204)", () => {
    it('a click opens the tip without a focus or a hover (red: the click is ignored)', () => {
      render(<Host purpose="reason-echo" />);
      fireEvent.click(screen.getByRole('button'));
      expect(tip()).not.toBeNull();
    });

    it('a plain name-echo click shows no tip', () => {
      render(<Host purpose="name-echo" />);
      fireEvent.click(screen.getByRole('button'));
      expect(tip()).toBeNull();
    });

    it('a stale tip does not reappear after the control unshades, loses focus and reshades (red: effect removed)', () => {
      const { rerender } = render(<Host purpose="reason-echo" content="Start editing." />);
      const button = screen.getByRole('button');
      fireEvent.focus(button);
      expect(tip()).not.toBeNull();
      // Unshaded: no reason, so the mechanism is inert and the tip is hidden.
      rerender(<Host purpose="reason-echo" content={undefined} />);
      expect(tip()).toBeNull();
      // Focus leaves while inert — `onBlur` returns early, so nothing closes the stale state.
      fireEvent.blur(button);
      rerender(<Host purpose="reason-echo" content="Start editing." />);
      expect(tip()).toBeNull();
      // And it released the app-wide token, so another tip can open normally.
      fireEvent.focus(button);
      expect(document.querySelectorAll('[data-tooltip]')).toHaveLength(1);
    });

    it('Escape still closes it and is not withheld from the application', () => {
      render(<Host purpose="reason-echo" />);
      fireEvent.click(screen.getByRole('button'));
      const event = new KeyboardEvent('keydown', {
        key: 'Escape',
        bubbles: true,
        cancelable: true,
      });
      act(() => void document.dispatchEvent(event));
      expect(event.defaultPrevented).toBe(true);
      expect(tip()).toBeNull();
    });

    it('a released long-press is still swallowed, not turned into a second reveal', () => {
      const onCommand = vi.fn();
      render(<Host purpose="reason-echo" onCommand={onCommand} />);
      const button = screen.getByRole('button');
      fireEvent.pointerDown(button, { pointerType: 'touch', clientX: 10, clientY: 10 });
      act(() => void vi.advanceTimersByTime(TOOLTIP_LONG_PRESS_MS + 10));
      fireEvent.pointerUp(button, { pointerType: 'touch' });
      fireEvent.click(button);
      expect(onCommand).not.toHaveBeenCalled();
      expect(tip()).not.toBeNull();
    });
  });

  describe("opensOn 'request' (ADR-0204 amended, #538)", () => {
    const renderRequest = (extra: Partial<TooltipOptions> & { onCommand?: () => void } = {}) =>
      render(<Host purpose="reason-echo" opensOn="request" {...extra} />);
    const trigger = (): HTMLElement => screen.getByRole('button', { name: 'Zoom in' });

    it('focus does not open it (red: onFocus ignores the option)', () => {
      renderRequest();
      fireEvent.focus(trigger());
      expect(tip()).toBeNull();
    });

    it('a click does not open it (red: the reason-echo click path ignores the option)', () => {
      renderRequest();
      fireEvent.click(trigger());
      expect(tip()).toBeNull();
    });

    it('a touch long-press does not open it and does not swallow the click (red: long-press left on)', () => {
      const onCommand = vi.fn();
      renderRequest({ onCommand });
      fireEvent.pointerDown(trigger(), { pointerType: 'touch', clientX: 10, clientY: 10 });
      act(() => void vi.advanceTimersByTime(TOOLTIP_LONG_PRESS_MS + 10));
      fireEvent.pointerUp(trigger(), { pointerType: 'touch' });
      fireEvent.click(trigger());
      expect(tip()).toBeNull();
      expect(onCommand).toHaveBeenCalledTimes(1);
    });

    it('hover still opens it after the delay', () => {
      renderRequest();
      fireEvent.pointerEnter(trigger(), { pointerType: 'mouse' });
      expect(tip()).toBeNull();
      act(() => void vi.advanceTimersByTime(TOOLTIP_OPEN_DELAY_MS));
      expect(tip()).toHaveTextContent('Zoom in');
    });

    it('show() opens it at once and closes any other open tip (red: show is not returned)', () => {
      render(
        <>
          <Host purpose="name-echo" content="Other" />
          <Host purpose="reason-echo" opensOn="request" content="Why" />
        </>,
      );
      fireEvent.focus(screen.getAllByRole('button', { name: 'Zoom in' })[0]!);
      expect(tip()).toHaveTextContent('Other');
      fireEvent.click(screen.getByRole('button', { name: 'ask' }));
      expect(document.querySelectorAll('[data-tooltip]')).toHaveLength(1);
      expect(tip()).toHaveTextContent('Why');
    });

    it('show() is a no-op while the content is absent', () => {
      renderRequest({ content: undefined });
      fireEvent.click(screen.getByRole('button', { name: 'ask' }));
      expect(tip()).toBeNull();
    });

    it('the next keydown anywhere closes it and is not withheld (red: no keydown close)', () => {
      renderRequest();
      fireEvent.click(screen.getByRole('button', { name: 'ask' }));
      expect(tip()).not.toBeNull();
      const event = new KeyboardEvent('keydown', {
        key: 'ArrowDown',
        bubbles: true,
        cancelable: true,
      });
      act(() => void document.dispatchEvent(event));
      expect(tip()).toBeNull();
      expect(event.defaultPrevented).toBe(false);
    });

    it('Escape closes it with preventDefault only, so it still reaches an outer handler', () => {
      renderRequest();
      fireEvent.click(screen.getByRole('button', { name: 'ask' }));
      const outer = vi.fn();
      window.addEventListener('keydown', outer);
      const event = new KeyboardEvent('keydown', {
        key: 'Escape',
        bubbles: true,
        cancelable: true,
      });
      act(() => void document.body.dispatchEvent(event));
      window.removeEventListener('keydown', outer);
      expect(event.defaultPrevented).toBe(true);
      expect(outer).toHaveBeenCalledTimes(1);
      expect(tip()).toBeNull();
    });

    it.each(['Shift', 'Control', 'Alt', 'Meta'])(
      'a lone %s keydown does not close it (red: every key closes)',
      (key) => {
        renderRequest();
        fireEvent.click(screen.getByRole('button', { name: 'ask' }));
        act(
          () => void document.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true })),
        );
        expect(tip()).not.toBeNull();
      },
    );

    it('a scroll anywhere closes it, since the tip is fixed (red: no scroll listener)', () => {
      renderRequest();
      fireEvent.click(screen.getByRole('button', { name: 'ask' }));
      act(() => void document.body.dispatchEvent(new Event('scroll')));
      expect(tip()).toBeNull();
    });

    it("a scroll does not close a default 'focus' tip (every other caller unchanged)", () => {
      render(<Host purpose="reason-echo" />);
      fireEvent.focus(screen.getByRole('button', { name: 'Zoom in' }));
      act(() => void document.body.dispatchEvent(new Event('scroll')));
      expect(tip()).not.toBeNull();
    });

    it('a plain touch tap still fires the command and shows nothing', () => {
      const onCommand = vi.fn();
      renderRequest({ onCommand });
      fireEvent.pointerDown(trigger(), { pointerType: 'touch', clientX: 10, clientY: 10 });
      fireEvent.pointerUp(trigger(), { pointerType: 'touch' });
      fireEvent.click(trigger());
      expect(onCommand).toHaveBeenCalledTimes(1);
      expect(tip()).toBeNull();
    });

    it('unmounting while open removes the tip and releases the one-open token', () => {
      const { unmount } = renderRequest();
      fireEvent.click(screen.getByRole('button', { name: 'ask' }));
      expect(tip()).not.toBeNull();
      unmount();
      expect(tip()).toBeNull();
      render(<Host purpose="name-echo" />);
      fireEvent.focus(screen.getByRole('button'));
      expect(document.querySelectorAll('[data-tooltip]')).toHaveLength(1);
    });

    it('show() keeps its identity across renders and content changes (red: a fresh function each render)', () => {
      const seen: Array<() => void> = [];
      function Probe({ content }: { content: string | undefined }): React.ReactElement {
        const { show } = useTooltip({ content, purpose: 'reason-echo', opensOn: 'request' });
        seen.push(show);
        return <span />;
      }
      const { rerender } = render(<Probe content="a" />);
      rerender(<Probe content="b" />);
      rerender(<Probe content={undefined} />);
      expect(new Set(seen).size).toBe(1);
    });

    it('the panel is aria-hidden and the trigger is linked to nothing', () => {
      renderRequest();
      fireEvent.click(screen.getByRole('button', { name: 'ask' }));
      expect(tip()).toHaveAttribute('aria-hidden', 'true');
      expect(tip()).not.toHaveAttribute('role');
      expect(trigger()).not.toHaveAttribute('aria-describedby');
    });

    it("the default 'focus' mode still opens on focus and click (every other caller unchanged)", () => {
      render(<Host purpose="reason-echo" />);
      fireEvent.focus(screen.getByRole('button', { name: 'Zoom in' }));
      expect(tip()).not.toBeNull();
    });
  });

  it("purpose 'description': role=tooltip, linked while open", () => {
    render(<Host purpose="description" content="Recomputes every date" />);
    fireEvent.focus(screen.getByRole('button'));
    const node = tip();
    expect(node).toHaveAttribute('role', 'tooltip');
    expect(screen.getByRole('button')).toHaveAttribute('aria-describedby', node?.id);
  });

  it('at most one tooltip is open application-wide (red: token removed)', () => {
    render(
      <>
        <Host content="First" />
        <Host content="Second" />
      </>,
    );
    const [first, second] = screen.getAllByRole('button');
    if (!first || !second) throw new Error('hosts missing');
    fireEvent.focus(first);
    expect(document.querySelectorAll('[data-tooltip]')).toHaveLength(1);
    fireEvent.focus(second);
    const tips = document.querySelectorAll('[data-tooltip]');
    expect(tips).toHaveLength(1);
    expect(tips[0]).toHaveTextContent('Second');
  });

  it('long-press opens the tip and swallows the click; a tap fires the command and shows nothing', () => {
    const onCommand = vi.fn();
    render(<Host onCommand={onCommand} />);
    const button = screen.getByRole('button');

    // Long-press: down (touch) → threshold elapses → up → click swallowed, tip open.
    fireEvent.pointerDown(button, { pointerType: 'touch', clientX: 10, clientY: 10 });
    act(() => void vi.advanceTimersByTime(TOOLTIP_LONG_PRESS_MS));
    fireEvent.pointerUp(button, { pointerType: 'touch' });
    fireEvent.click(button);
    expect(onCommand).not.toHaveBeenCalled();
    expect(tip()).not.toBeNull();

    // Tap: down → up before the threshold → click proceeds, no tooltip from the press.
    fireEvent.keyDown(document, { key: 'Escape' }); // clear the open tip first
    fireEvent.pointerDown(button, { pointerType: 'touch', clientX: 10, clientY: 10 });
    act(() => void vi.advanceTimersByTime(100));
    fireEvent.pointerUp(button, { pointerType: 'touch' });
    fireEvent.click(button);
    expect(onCommand).toHaveBeenCalledTimes(1);
    expect(tip()).toBeNull();
  });

  it('a pending long-press is cancelled by movement past the tolerance', () => {
    const onCommand = vi.fn();
    render(<Host onCommand={onCommand} />);
    const button = screen.getByRole('button');
    fireEvent.pointerDown(button, { pointerType: 'touch', clientX: 10, clientY: 10 });
    fireEvent.pointerMove(document, { clientX: 40, clientY: 10 }); // a scroll, not a press
    act(() => void vi.advanceTimersByTime(TOOLTIP_LONG_PRESS_MS + 50));
    expect(tip()).toBeNull();
    fireEvent.pointerUp(button, { pointerType: 'touch' });
    fireEvent.click(button);
    expect(onCommand).toHaveBeenCalledTimes(1); // the command still works after the scroll
  });

  it('unmounting mid-press strips the document listeners itself (red: pressCleanup call removed)', () => {
    // The long-press wires three document-level listeners. The platform's own pointerup would
    // remove them momentarily, but cleanup that depends on an external event rather than the
    // component's lifecycle is a stale-closure hold — the M-G frontend-performance finding. The
    // oracle is remove-calls matching add-calls for the three press events, asserted BY COUNT
    // because the handlers are closures this test cannot reach.
    const added: string[] = [];
    const removed: string[] = [];
    const addSpy = vi.spyOn(document, 'addEventListener');
    const removeSpy = vi.spyOn(document, 'removeEventListener');
    addSpy.mockImplementation((type) => void added.push(type));
    removeSpy.mockImplementation((type) => void removed.push(type));
    try {
      const view = render(<Host />);
      fireEvent.pointerDown(screen.getByRole('button'), {
        pointerType: 'touch',
        clientX: 10,
        clientY: 10,
      });
      const pressEvents = ['pointermove', 'pointerup', 'pointercancel'];
      expect(added.filter((t) => pressEvents.includes(t))).toHaveLength(3);
      view.unmount(); // mid-press: no pointerup ever fires
      for (const type of pressEvents) {
        expect(removed.filter((t) => t === type).length).toBeGreaterThanOrEqual(
          added.filter((t) => t === type).length,
        );
      }
    } finally {
      addSpy.mockRestore();
      removeSpy.mockRestore();
    }
  });

  /** Put the trigger at `top` (24 px tall) in a 768 px jsdom viewport, focus it, read the tip. */
  function openAt(top: number): { tipTop: number; triggerTop: number; triggerBottom: number } {
    render(<Host />);
    const button = screen.getByRole('button');
    const rect = {
      top,
      bottom: top + 24,
      left: 100,
      right: 124,
      width: 24,
      height: 24,
      x: 100,
      y: top,
    };
    vi.spyOn(button, 'getBoundingClientRect').mockReturnValue({ ...rect, toJSON: () => rect });
    fireEvent.focus(button);
    const el = tip();
    if (!el) throw new Error('the tip did not open');
    return { tipTop: parseFloat(el.style.top), triggerTop: rect.top, triggerBottom: rect.bottom };
  }

  it('sits below a trigger with room beneath it', () => {
    const { tipTop, triggerBottom } = openAt(100);
    expect(tipTop).toBeGreaterThanOrEqual(triggerBottom);
  });

  it('flips above a trigger on the bottom edge rather than covering it (red: below-only placement)', () => {
    // The zero-duration-task M4 defect: clamped onto the trigger, the tip caught the mouseup, so a
    // mouse click on the canvas dock's icon-only button never reached it.
    expect(window.innerHeight).toBe(768);
    const { tipTop, triggerTop } = openAt(740);
    const height = tip()!.getBoundingClientRect().height;
    expect(tipTop + height).toBeLessThanOrEqual(triggerTop);
  });

  describe('a viewport with room on neither side (TECH_DEBT #400)', () => {
    const TIP_HEIGHT = 40;
    const viewportHeight = window.innerHeight;
    afterEach(() => {
      window.innerHeight = viewportHeight;
      vi.restoreAllMocks();
    });

    /** A 60 px viewport, a 24 px trigger at `top` and a 40 px tip: neither side can hold the tip. */
    function openSqueezed(top: number): {
      tipTop: number;
      triggerTop: number;
      triggerBottom: number;
    } {
      window.innerHeight = 60;
      render(<Host />);
      const button = screen.getByRole('button');
      const box = (t: number, h: number): DOMRect => {
        const r = {
          top: t,
          bottom: t + h,
          left: 100,
          right: 124,
          width: 24,
          height: h,
          x: 100,
          y: t,
        };
        return { ...r, toJSON: () => r };
      };
      vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(function (
        this: HTMLElement,
      ) {
        return this.hasAttribute('data-tooltip') ? box(0, TIP_HEIGHT) : box(top, 24);
      });
      fireEvent.focus(button);
      const el = tip();
      if (!el) throw new Error('the tip did not open');
      return { tipTop: parseFloat(el.style.top), triggerTop: top, triggerBottom: top + 24 };
    }

    it('goes above, clear of the trigger, when that side has more room (red: second clamp)', () => {
      const { tipTop, triggerTop } = openSqueezed(30);
      expect(tipTop + TIP_HEIGHT).toBeLessThanOrEqual(triggerTop);
    });

    it('goes below, clear of the trigger, when that side has more room (red: second clamp)', () => {
      const { tipTop, triggerBottom } = openSqueezed(2);
      expect(tipTop).toBeGreaterThanOrEqual(triggerBottom);
    });
  });

  it('disabled leaves the mechanism inert', () => {
    render(<Host disabled />);
    fireEvent.focus(screen.getByRole('button'));
    fireEvent.pointerEnter(screen.getByRole('button'), { pointerType: 'mouse' });
    act(() => void vi.advanceTimersByTime(TOOLTIP_OPEN_DELAY_MS + 50));
    expect(tip()).toBeNull();
  });

  it('empty content leaves the mechanism inert', () => {
    render(<Host content={undefined} />);
    fireEvent.focus(screen.getByRole('button'));
    fireEvent.pointerEnter(screen.getByRole('button'), { pointerType: 'mouse' });
    act(() => void vi.advanceTimersByTime(TOOLTIP_OPEN_DELAY_MS + 50));
    expect(tip()).toBeNull();
  });
  describe('placement and dismiss-on-press (the diagram corner cluster)', () => {
    // jsdom has no layout, so the trigger's rect is stubbed: a trigger mid-window, where both sides
    // fit — so the side taken is the preference and nothing else.
    function stubRect(): void {
      vi.stubGlobal('innerHeight', 1000);
      vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(function (
        this: HTMLElement,
      ) {
        return this.hasAttribute('data-tooltip')
          ? ({
              x: 0,
              y: 0,
              left: 0,
              top: 0,
              right: 100,
              bottom: 28,
              width: 100,
              height: 28,
            } as DOMRect)
          : ({
              x: 500,
              y: 400,
              left: 500,
              top: 400,
              right: 536,
              bottom: 436,
              width: 36,
              height: 36,
            } as DOMRect);
      });
    }
    afterEach(() => {
      vi.restoreAllMocks();
      vi.unstubAllGlobals();
    });

    it('opens below by default and above when asked (red: preference ignored)', () => {
      stubRect();
      const { unmount } = render(<Host />);
      fireEvent.focus(screen.getByRole('button'));
      const below = Number.parseFloat((tip() as HTMLElement).style.top);
      unmount();
      render(<Host placement="above" />);
      fireEvent.focus(screen.getByRole('button'));
      const above = Number.parseFloat((tip() as HTMLElement).style.top);
      expect(below).toBeGreaterThanOrEqual(436);
      expect(above).toBeLessThan(400);
    });

    it('closes when the trigger is pressed, only when asked (red: listener removed)', () => {
      render(<Host dismissOnPress />);
      const button = screen.getByRole('button');
      fireEvent.focus(button);
      expect(tip()).not.toBeNull();
      fireEvent.click(button);
      expect(tip()).toBeNull();
    });

    it('keeps the tip a long-press just opened, although the lift fires a click (red: not skipped)', () => {
      render(<Host dismissOnPress />);
      const button = screen.getByRole('button');
      fireEvent.pointerDown(button, { pointerType: 'touch', clientX: 5, clientY: 5 });
      act(() => void vi.advanceTimersByTime(TOOLTIP_LONG_PRESS_MS));
      expect(tip()).not.toBeNull();
      fireEvent.pointerUp(button, { pointerType: 'touch' });
      fireEvent.click(button);
      expect(tip()).not.toBeNull();
    });

    it('stays open on a press by default', () => {
      render(<Host />);
      const button = screen.getByRole('button');
      fireEvent.focus(button);
      fireEvent.click(button);
      expect(tip()).not.toBeNull();
    });
  });
});
