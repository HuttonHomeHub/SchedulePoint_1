import { act, render, screen } from '@testing-library/react';
import { useState } from 'react';
import { createPortal } from 'react-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { AnnouncerProvider } from './announcer';
import { useContainerUnmountHandoff } from './use-container-unmount-handoff';

/**
 * **ADR-0135 for a container that goes** — one hook, three call sites' worth of rules
 * (`use-container-unmount-handoff.ts`). The cases are the two shapes the first hand-written copy got
 * wrong or right by accident:
 *
 * - focus dropped onto blank space (a blur with no related target) and the container later goes for
 *   an unrelated reason: it must NOT take focus from wherever the reader is by then;
 * - the container's host node is removed before the owner unmounts (a portal into a node the same
 *   commit deletes): the document has no `activeElement` left to ask, so the record decides.
 *
 * Verified red against the first copy's rule (a flag cleared only by a blur WITH a related target):
 * the "blank space" case then hands focus to the destination and speaks.
 */
function Container({ slot }: { slot: HTMLElement | null }): React.ReactElement | null {
  const handoff = useContainerUnmountHandoff({
    target: '[data-target]',
    message: 'The panel closed. Focus moved to Target.',
  });
  const body = (
    <div {...handoff} data-testid="wrapper">
      <button type="button">Inside</button>
    </div>
  );
  return slot ? createPortal(body, slot) : body;
}

function Harness({ viaPortal = false }: { viaPortal?: boolean }): React.ReactElement {
  const [shown, setShown] = useState(true);
  const [slotShown, setSlotShown] = useState(true);
  const [slot, setSlot] = useState<HTMLElement | null>(null);
  return (
    <AnnouncerProvider>
      <button type="button" data-target onClick={() => setShown(false)}>
        Target
      </button>
      <button type="button">Elsewhere</button>
      <button type="button" onClick={() => setSlotShown(false)}>
        Remove host
      </button>
      {viaPortal && slotShown ? <div ref={setSlot} /> : null}
      {/* The app's own sequence: the host node is deleted in one commit, its ref callback reports
          `null`, and the container (mounted only while it has a slot) goes in the next. */}
      {viaPortal ? shown && slot ? <Container slot={slot} /> : null : null}
      {!viaPortal && shown ? <Container slot={null} /> : null}
    </AnnouncerProvider>
  );
}

beforeEach(() => {
  vi.stubGlobal('requestAnimationFrame', (cb: FrameRequestCallback) => {
    cb(0);
    return 1;
  });
  vi.stubGlobal('cancelAnimationFrame', () => undefined);
});
afterEach(() => vi.unstubAllGlobals());

describe('useContainerUnmountHandoff', () => {
  it('hands focus to the target and says so when it unmounts under focus', () => {
    render(<Harness />);
    screen.getByRole('button', { name: 'Inside' }).focus();
    act(() => screen.getByRole('button', { name: 'Target' }).click());
    expect(screen.queryByRole('button', { name: 'Inside' })).toBeNull();
    expect(screen.getByRole('button', { name: 'Target' })).toHaveFocus();
    expect(screen.getByTestId('announcer')).toHaveTextContent(
      'The panel closed. Focus moved to Target.',
    );
  });

  it('leaves a reader who dropped focus onto blank space alone when it goes later', () => {
    render(<Harness />);
    const inside = screen.getByRole('button', { name: 'Inside' });
    inside.focus();
    // A click on blank space: the button blurs with no related target and the wrapper stays put.
    act(() => inside.blur());
    screen.getByRole('button', { name: 'Elsewhere' }).focus();
    act(() => screen.getByRole('button', { name: 'Target' }).click());
    expect(screen.getByRole('button', { name: 'Elsewhere' })).toHaveFocus();
    expect(screen.getByTestId('announcer')).toHaveTextContent('');
  });

  it('does not take focus when it is unmounted by a control that is not the target', () => {
    render(<Harness />);
    screen.getByRole('button', { name: 'Inside' }).focus();
    // Focus moves to a sibling by the reader's own hand, then the container goes.
    screen.getByRole('button', { name: 'Elsewhere' }).focus();
    act(() => screen.getByRole('button', { name: 'Target' }).click());
    expect(screen.getByTestId('announcer')).toHaveTextContent('');
  });

  it('still hands focus on when the host node was removed before the owner unmounted', () => {
    render(<Harness viaPortal />);
    screen.getByRole('button', { name: 'Inside' }).focus();
    // The diagram leaving: the node the portal draws into is deleted first, which drops focus to
    // <body> before this container's cleanup can ask the document where focus is.
    act(() => screen.getByRole('button', { name: 'Remove host' }).click());
    expect(screen.queryByRole('button', { name: 'Inside' })).toBeNull();
    expect(screen.getByRole('button', { name: 'Target' })).toHaveFocus();
    expect(screen.getByTestId('announcer')).toHaveTextContent(
      'The panel closed. Focus moved to Target.',
    );
  });
});
