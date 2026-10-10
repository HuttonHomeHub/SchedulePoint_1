import { render, screen } from '@testing-library/react';
import { useRef, useState } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { PROMOTION_LADDER } from './promotion-ladder';
import type { TsldToolbarContext } from './tsld-toolbar-context';
import { useCloseOnPromotionChange, usePromotionFocusFollow } from './use-promotion-focus';

import type { PromotableEntry, PromotionState } from '@/components/ui/toolbar/toolbar-promotion';

const announceSpy = vi.fn();
vi.mock('@/components/ui/announcer', () => ({ useAnnounce: () => announceSpy }));

/**
 * **E-1: a resize promotes the command a reader is standing on in a menu** (toolbar-redesign M5,
 * spec §4.11). The menu row unmounts under their focus, and the menu is portalled, so no toolbar
 * primitive can see it; `usePromotionFocusFollow` remembers the row by its accessible name and, when
 * exactly that command arrives on the bar, moves focus to its button and says so.
 *
 * Driven on a harness that reproduces the one thing the host supplies — a menu in a portal holding a
 * row named by the entry's `menuLabel`, and a bar button carrying `data-toolbar-item` — because
 * jsdom has no layout, so the stage is handed in rather than measured. Every branch was verified red
 * against the hook with that line removed.
 */

let frames: FrameRequestCallback[] = [];
function flushFrames(): void {
  const queued = frames;
  frames = [];
  for (const cb of queued) cb(0);
}

beforeEach(() => {
  announceSpy.mockReset();
  frames = [];
  vi.stubGlobal('requestAnimationFrame', (cb: FrameRequestCallback): number => {
    frames.push(cb);
    return frames.length;
  });
});

afterEach(() => vi.unstubAllGlobals());

const entry = (
  id: string,
  menuLabel: string,
  label: string,
): PromotableEntry<TsldToolbarContext> => ({
  id,
  label,
  menuLabel,
  menuName: 'Filter',
  icon: undefined,
  from: 'filter',
  rank: 1,
  at: PROMOTION_LADDER.L1,
  onActivate: () => {},
});

const ENTRIES = [
  entry('critical-only', 'Critical', 'Critical only'),
  entry('health-check', 'Health check…', 'Health check'),
];

const WIDE: PromotionState = { stage: 2, pointer: 'fine' };
const NARROW: PromotionState = { stage: 0, pointer: 'fine' };

/** The bar button and the menu row of an entry exist exactly one at a time, as the real menus do. */
function Harness({ promotion }: { promotion: PromotionState }): React.ReactElement {
  usePromotionFocusFollow(promotion, ENTRIES);
  const promoted = promotion.stage >= 2;
  return (
    <>
      <div role="toolbar" aria-label="Plan commands">
        {promoted ? (
          <button type="button" data-toolbar-item="critical-only">
            Critical only
          </button>
        ) : null}
      </div>
      <div role="menu" aria-label="Filter">
        {promoted ? null : (
          <button type="button" role="menuitem">
            Critical
          </button>
        )}
        <button type="button" role="menuitem">
          Has constraint
        </button>
      </div>
    </>
  );
}

describe('usePromotionFocusFollow', () => {
  it('moves focus to the promoted button and says so, when the row focus was on is promoted', () => {
    // Verified red by deleting the `button.focus()` call.
    const { rerender } = render(<Harness promotion={NARROW} />);
    screen.getByRole('menuitem', { name: 'Critical' }).focus();

    rerender(<Harness promotion={WIDE} />);
    expect(document.activeElement).toBe(document.body);
    flushFrames();

    expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Critical only' }));
    expect(announceSpy).toHaveBeenCalledWith('Critical only is now on the toolbar.');
  });

  it('does nothing when the row focus is on is not the one that moved', () => {
    // Verified red by matching on any promoted entry rather than the focused row's name.
    const { rerender } = render(<Harness promotion={NARROW} />);
    screen.getByRole('menuitem', { name: 'Has constraint' }).focus();

    rerender(<Harness promotion={WIDE} />);
    flushFrames();

    expect(document.activeElement).toBe(screen.getByRole('menuitem', { name: 'Has constraint' }));
    expect(announceSpy).not.toHaveBeenCalled();
  });

  it('does nothing when the row is still there after the stage changes', () => {
    // A stage that promotes something else: the focused row survives, so there is nothing to follow.
    const { rerender } = render(<Harness promotion={{ stage: 0, pointer: 'fine' }} />);
    screen.getByRole('menuitem', { name: 'Critical' }).focus();

    rerender(<Harness promotion={{ stage: 1, pointer: 'fine' }} />);
    flushFrames();

    expect(document.activeElement).toBe(screen.getByRole('menuitem', { name: 'Critical' }));
    expect(announceSpy).not.toHaveBeenCalled();
  });

  it('yields to anything else that moved focus during the frame', () => {
    // Verified red by removing the `activeElement` guard.
    const { rerender } = render(<Harness promotion={NARROW} />);
    const elsewhere = document.createElement('button');
    document.body.append(elsewhere);
    screen.getByRole('menuitem', { name: 'Critical' }).focus();

    rerender(<Harness promotion={WIDE} />);
    elsewhere.focus();
    flushFrames();

    expect(document.activeElement).toBe(elsewhere);
    expect(announceSpy).not.toHaveBeenCalled();
    elsewhere.remove();
  });

  it('does not follow a reader who moved off the row themselves before the resize', () => {
    // The blur rule: a real move to another element clears the record.
    const { rerender } = render(<Harness promotion={NARROW} />);
    screen.getByRole('menuitem', { name: 'Critical' }).focus();
    screen.getByRole('menuitem', { name: 'Has constraint' }).focus();

    rerender(<Harness promotion={WIDE} />);
    flushFrames();

    expect(announceSpy).not.toHaveBeenCalled();
  });

  it('does not follow focus that was never in a menu', () => {
    const { rerender } = render(<Harness promotion={NARROW} />);
    const outside = document.createElement('button');
    document.body.append(outside);
    outside.focus();

    rerender(<Harness promotion={WIDE} />);
    flushFrames();

    expect(document.activeElement).toBe(outside);
    expect(announceSpy).not.toHaveBeenCalled();
    outside.remove();
  });
});

describe('useCloseOnPromotionChange', () => {
  function Menu({ promotion }: { promotion: PromotionState }): React.ReactElement {
    const [open, setOpen] = useState(true);
    const trigger = useRef<HTMLButtonElement>(null);
    useCloseOnPromotionChange(promotion, open, () => setOpen(false), trigger);
    return (
      <>
        <button type="button" ref={trigger}>
          Analysis
        </button>
        {open ? (
          <div role="menu">
            <button type="button" role="menuitem">
              Baselines…
            </button>
          </div>
        ) : (
          <span>shut</span>
        )}
      </>
    );
  }

  it('closes an open menu when the viewport crosses a stage', () => {
    // Verified red by deleting the `close()` call.
    const { rerender } = render(<Menu promotion={NARROW} />);
    expect(screen.getByRole('menu')).toBeInTheDocument();
    rerender(<Menu promotion={WIDE} />);
    expect(screen.queryByRole('menu')).toBeNull();
  });

  it('hands focus to the trigger, and says why, when focus was inside the menu it closed', () => {
    // Verified red by deleting the `restoreTo.current?.focus()` line: focus lands on <body>.
    const { rerender } = render(<Menu promotion={NARROW} />);
    screen.getByRole('menuitem', { name: 'Baselines…' }).focus();

    rerender(<Menu promotion={WIDE} />);

    expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Analysis' }));
    expect(announceSpy).toHaveBeenCalledWith('Menu closed because the toolbar changed.');
  });

  it('leaves focus alone when it was not inside the menu', () => {
    const { rerender } = render(<Menu promotion={NARROW} />);
    const outside = document.createElement('button');
    document.body.append(outside);
    outside.focus();

    rerender(<Menu promotion={WIDE} />);

    expect(document.activeElement).toBe(outside);
    expect(announceSpy).not.toHaveBeenCalled();
    outside.remove();
  });

  it('leaves a menu alone when the state is unchanged (a re-render is not a resize)', () => {
    const { rerender } = render(<Menu promotion={NARROW} />);
    rerender(<Menu promotion={NARROW} />);
    expect(screen.getByRole('menu')).toBeInTheDocument();
  });
});
