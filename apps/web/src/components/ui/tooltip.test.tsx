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
  const { triggerProps, tooltip } = useTooltip({
    content: 'content' in options ? options.content : 'Zoom in',
    purpose: options.purpose ?? 'name-echo',
    disabled: options.disabled,
  });
  return (
    <>
      <button {...triggerProps} aria-label="Zoom in" onClick={onCommand}>
        +
      </button>
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
});
