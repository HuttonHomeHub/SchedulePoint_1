import { useCallback, useEffect, useRef, useState } from 'react';

export interface CodesDialogHost {
  /** The dialog is showing. */
  open: boolean;
  /**
   * The dialog has been asked for at least once. The host mounts it lazily on the first request and
   * keeps it mounted after (it unmounts its own contents on close), so almost no session pays for its
   * code on the way into the plan.
   */
  wanted: boolean;
  request: () => void;
  close: () => void;
}

/**
 * **Open state for the Codes… dialog, and where focus returns when it closes.**
 *
 * The dialog's code is split off and loads on the first request, so by the time the native `<dialog>`
 * calls `showModal()` focus may already have moved, and its own restore would return to the wrong
 * element: the opener is taken at the request, while it still holds focus. The parent's effect runs
 * after the dialog's own close (children first), so this has the last word over the native restore;
 * an opener that has left the page is not a place to return to.
 */
export function useCodesDialog(): CodesDialogHost {
  const [open, setOpen] = useState(false);
  const [wanted, setWanted] = useState(false);
  const openerRef = useRef<HTMLElement | null>(null);

  const request = useCallback(() => {
    const held = document.activeElement;
    if (held instanceof HTMLElement && held !== document.body) openerRef.current = held;
    setWanted(true);
    setOpen(true);
  }, []);
  const close = useCallback(() => setOpen(false), []);

  useEffect(() => {
    if (open) return;
    const opener = openerRef.current;
    openerRef.current = null;
    if (opener?.isConnected) opener.focus();
  }, [open]);

  return { open, wanted, request, close };
}
