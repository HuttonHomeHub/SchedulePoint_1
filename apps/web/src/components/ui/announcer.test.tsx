import { act, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { AnnouncerProvider, useAnnounce } from './announcer';

/**
 * The single polite region writes once per frame, so two announcements asked for in one frame must both
 * be kept, in order: Follow logic's outcome and the focus hand-off's sentence arrive together.
 */
function Caller({ messages }: { messages: readonly string[] }): React.ReactElement {
  const announce = useAnnounce();
  return (
    <button
      type="button"
      onClick={() => {
        for (const message of messages) announce(message);
      }}
    >
      go
    </button>
  );
}

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['requestAnimationFrame', 'cancelAnimationFrame'] });
});
afterEach(() => vi.useRealTimers());

describe('the polite region', () => {
  it('speaks one announcement', () => {
    render(
      <AnnouncerProvider>
        <Caller messages={['Saved.']} />
      </AnnouncerProvider>,
    );
    act(() => screen.getByRole('button').click());
    act(() => {
      vi.advanceTimersByTime(20);
    });
    expect(screen.getByTestId('announcer')).toHaveTextContent(/^Saved\.$/);
  });

  it('speaks the same sentence once when it is asked for twice in one frame', () => {
    render(
      <AnnouncerProvider>
        <Caller messages={['Saved.', 'Saved.', 'Moved.']} />
      </AnnouncerProvider>,
    );
    act(() => screen.getByRole('button').click());
    act(() => {
      vi.advanceTimersByTime(20);
    });
    expect(screen.getByTestId('announcer')).toHaveTextContent(/^Saved\. Moved\.$/);
  });

  it('keeps both of two announcements asked for in one frame, in order', () => {
    render(
      <AnnouncerProvider>
        <Caller
          messages={['Two bars now follow their logic.', 'Follow logic is no longer available.']}
        />
      </AnnouncerProvider>,
    );
    act(() => screen.getByRole('button').click());
    act(() => {
      vi.advanceTimersByTime(20);
    });
    expect(screen.getByTestId('announcer')).toHaveTextContent(
      'Two bars now follow their logic. Follow logic is no longer available.',
    );
  });

  it('appends an announcement made in the frame that wrote the last one', () => {
    function Two(): React.ReactElement {
      const announce = useAnnounce();
      return (
        <>
          <button type="button" onClick={() => announce('Outcome.')}>
            one
          </button>
          <button type="button" onClick={() => announce('Hand-off.')}>
            two
          </button>
        </>
      );
    }
    render(
      <AnnouncerProvider>
        <Two />
      </AnnouncerProvider>,
    );
    act(() => screen.getByRole('button', { name: 'one' }).click());
    act(() => {
      vi.advanceTimersByTime(16);
    });
    act(() => screen.getByRole('button', { name: 'two' }).click());
    act(() => {
      vi.advanceTimersByTime(40);
    });
    expect(screen.getByTestId('announcer')).toHaveTextContent('Outcome. Hand-off.');
  });

  it('never joins what two separate key presses asked for, however quick', () => {
    function Two(): React.ReactElement {
      const announce = useAnnounce();
      return (
        <>
          <button type="button" onClick={() => announce('Excavate.')}>
            one
          </button>
          <button type="button" onClick={() => announce('0 predecessors, 0 successors')}>
            two
          </button>
        </>
      );
    }
    render(
      <AnnouncerProvider>
        <Two />
      </AnnouncerProvider>,
    );
    fireEvent.keyDown(document.body, { key: 'Home' });
    act(() => screen.getByRole('button', { name: 'one' }).click());
    act(() => {
      vi.advanceTimersByTime(16);
    });
    // Inside the frame that wrote "Excavate.", a second press: it starts a new announcement.
    fireEvent.keyDown(document.body, { key: 'i' });
    act(() => screen.getByRole('button', { name: 'two' }).click());
    act(() => {
      vi.advanceTimersByTime(40);
    });
    expect(screen.getByTestId('announcer')).toHaveTextContent(/^0 predecessors, 0 successors$/);
  });

  it('drops what was waiting when a new press asks before the write', () => {
    function Two(): React.ReactElement {
      const announce = useAnnounce();
      return (
        <>
          <button type="button" onClick={() => announce('No successors.')}>
            one
          </button>
          <button type="button" onClick={() => announce('No predecessors.')}>
            two
          </button>
        </>
      );
    }
    render(
      <AnnouncerProvider>
        <Two />
      </AnnouncerProvider>,
    );
    fireEvent.keyDown(document.body, { key: ']' });
    act(() => screen.getByRole('button', { name: 'one' }).click());
    fireEvent.keyDown(document.body, { key: '[' });
    act(() => screen.getByRole('button', { name: 'two' }).click());
    act(() => {
      vi.advanceTimersByTime(40);
    });
    expect(screen.getByTestId('announcer')).toHaveTextContent(/^No predecessors\.$/);
  });

  it('treats a pointer press as a new press too', () => {
    function Two(): React.ReactElement {
      const announce = useAnnounce();
      return (
        <>
          <button type="button" onClick={() => announce('First.')}>
            one
          </button>
          <button type="button" onClick={() => announce('Second.')}>
            two
          </button>
        </>
      );
    }
    render(
      <AnnouncerProvider>
        <Two />
      </AnnouncerProvider>,
    );
    act(() => screen.getByRole('button', { name: 'one' }).click());
    act(() => {
      vi.advanceTimersByTime(16);
    });
    fireEvent.pointerDown(screen.getByRole('button', { name: 'two' }));
    act(() => screen.getByRole('button', { name: 'two' }).click());
    act(() => {
      vi.advanceTimersByTime(40);
    });
    expect(screen.getByTestId('announcer')).toHaveTextContent(/^Second\.$/);
  });

  it('still joins two messages one press caused', () => {
    render(
      <AnnouncerProvider>
        <Caller messages={['Outcome.', 'Hand-off.']} />
      </AnnouncerProvider>,
    );
    fireEvent.pointerDown(screen.getByRole('button'));
    act(() => screen.getByRole('button').click());
    act(() => {
      vi.advanceTimersByTime(40);
    });
    expect(screen.getByTestId('announcer')).toHaveTextContent(/^Outcome\. Hand-off\.$/);
  });

  it('replaces the previous text when the next announcement is a later frame', () => {
    function Two(): React.ReactElement {
      const announce = useAnnounce();
      return (
        <>
          <button type="button" onClick={() => announce('Early.')}>
            one
          </button>
          <button type="button" onClick={() => announce('Late.')}>
            two
          </button>
        </>
      );
    }
    render(
      <AnnouncerProvider>
        <Two />
      </AnnouncerProvider>,
    );
    act(() => screen.getByRole('button', { name: 'one' }).click());
    act(() => {
      vi.advanceTimersByTime(40);
    });
    act(() => {
      vi.advanceTimersByTime(1000);
    });
    act(() => screen.getByRole('button', { name: 'two' }).click());
    act(() => {
      vi.advanceTimersByTime(40);
    });
    expect(screen.getByTestId('announcer')).toHaveTextContent(/^Late\.$/);
  });

  describe('a transient message', () => {
    function Pair({ order }: { order: readonly ('count' | 'real')[] }): React.ReactElement {
      const announce = useAnnounce();
      return (
        <button
          type="button"
          onClick={() => {
            for (const kind of order) {
              if (kind === 'count') announce('5 results available.', { transient: true });
              else announce('Set Area to Roof on 3 activities.');
            }
          }}
        >
          go
        </button>
      );
    }
    const speak = (order: readonly ('count' | 'real')[]): HTMLElement => {
      render(
        <AnnouncerProvider>
          <Pair order={order} />
        </AnnouncerProvider>,
      );
      act(() => screen.getByRole('button').click());
      act(() => {
        vi.advanceTimersByTime(20);
      });
      return screen.getByTestId('announcer');
    };

    it('is dropped when a real message follows it in the frame', () => {
      expect(speak(['count', 'real'])).toHaveTextContent(/^Set Area to Roof on 3 activities\.$/);
    });

    it('is dropped when it follows a real message in the frame', () => {
      expect(speak(['real', 'count'])).toHaveTextContent(/^Set Area to Roof on 3 activities\.$/);
    });

    it('is spoken on its own', () => {
      expect(speak(['count'])).toHaveTextContent(/^5 results available\.$/);
    });

    it('is replaced, not prefixed, by a real message in the frame after its write', () => {
      function Later(): React.ReactElement {
        const announce = useAnnounce();
        return (
          <>
            <button
              type="button"
              onClick={() => announce('5 results available.', { transient: true })}
            >
              count
            </button>
            <button type="button" onClick={() => announce('Set Area to Roof.')}>
              real
            </button>
          </>
        );
      }
      render(
        <AnnouncerProvider>
          <Later />
        </AnnouncerProvider>,
      );
      act(() => screen.getByRole('button', { name: 'count' }).click());
      act(() => {
        vi.advanceTimersByTime(16);
      });
      act(() => screen.getByRole('button', { name: 'real' }).click());
      act(() => {
        vi.advanceTimersByTime(20);
      });
      expect(screen.getByTestId('announcer')).toHaveTextContent(/^Set Area to Roof\.$/);
    });
  });
});
