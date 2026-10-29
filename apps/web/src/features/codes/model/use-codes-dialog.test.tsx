import { act, render, renderHook, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { useCodesDialog } from './use-codes-dialog';

describe('useCodesDialog', () => {
  it('starts shut and unwanted, so a plan that never opens it pays nothing', () => {
    const { result } = renderHook(() => useCodesDialog());
    expect(result.current).toMatchObject({ open: false, wanted: false });
  });

  it('is wanted from the first request on, and stays wanted after it closes', () => {
    const { result } = renderHook(() => useCodesDialog());
    act(() => result.current.request());
    expect(result.current).toMatchObject({ open: true, wanted: true });
    act(() => result.current.close());
    expect(result.current).toMatchObject({ open: false, wanted: true });
  });

  it('returns focus to the control that asked, taken at the request, when it closes', () => {
    function Host(): React.ReactElement {
      const dialog = useCodesDialog();
      return (
        <>
          <button type="button" onClick={dialog.request}>
            Codes…
          </button>
          <button type="button" onClick={dialog.close}>
            Close
          </button>
        </>
      );
    }
    render(<Host />);
    const opener = screen.getByRole('button', { name: 'Codes…' });
    opener.focus();
    act(() => opener.click());
    // Focus has gone somewhere else by the time the lazy dialog is up and has shown itself.
    screen.getByRole('button', { name: 'Close' }).focus();
    act(() => screen.getByRole('button', { name: 'Close' }).click());
    expect(opener).toHaveFocus();
  });

  it('does not pull focus to an opener that has left the page', () => {
    function Host(): React.ReactElement {
      const dialog = useCodesDialog();
      return (
        <>
          {dialog.open ? null : (
            <button type="button" onClick={dialog.request}>
              Codes…
            </button>
          )}
          <button type="button" onClick={dialog.close}>
            Close
          </button>
        </>
      );
    }
    render(<Host />);
    const opener = screen.getByRole('button', { name: 'Codes…' });
    opener.focus();
    act(() => opener.click());
    const close = screen.getByRole('button', { name: 'Close' });
    close.focus();
    act(() => close.click());
    // The opener was unmounted while open and is a NEW element now: nothing to return to.
    expect(screen.getByRole('button', { name: 'Codes…' })).not.toHaveFocus();
  });
});
