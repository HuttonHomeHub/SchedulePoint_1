import { createContext, useContext } from 'react';

/**
 * **Lets content inside a `ToolbarPopover` close it, handing focus to its trigger.** A control in the
 * panel that opens a modal dialog (swimlanes M2-T9: Set up swimlanes…) needs this: the browser returns
 * a closed dialog's focus to whatever was focused when it opened, and if that is a button inside a
 * panel that an outside press has since unmounted, focus falls to `<body>`. Closing the panel first,
 * synchronously, makes the trigger the element the dialog returns to.
 *
 * `null` outside a popover, so a control can call it unconditionally with `?.()`.
 */
export const PopoverCloseContext = createContext<(() => void) | null>(null);

export function usePopoverClose(): (() => void) | null {
  return useContext(PopoverCloseContext);
}
