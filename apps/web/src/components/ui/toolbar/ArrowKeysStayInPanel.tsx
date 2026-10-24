import { TOOLBAR_NAV_KEYS } from './toolbar-keyboard';

/**
 * **A popover's arrow keys belong to what is inside it.** A `ToolbarPopover` panel (and the panel
 * `usePopoverPanel` returns) is portalled out of the toolbar in the DOM but **not in the React
 * tree**, so a key pressed in a field inside it still bubbles to the toolbar's roving handler and
 * walks focus off the field the reader is on. This wrapper stops the six navigation keys
 * ({@link TOOLBAR_NAV_KEYS}) at the panel's edge.
 *
 * It claims all six unconditionally, which is right for a panel whose controls are value-steppers
 * (a `<select>`, a number or date field) and would be wrong for a bar-level control; see
 * `toolbar-keyboard.ts` for the per-control rule the containers themselves use. Escape, Tab and
 * Enter are untouched, so the panel still closes and submits as its own contract says.
 *
 * **Do not wrap a panel whose content is itself a roving widget** (a `Menu`, a listbox) whose arrow
 * handler sits on a container ABOVE this wrapper and relies on the key bubbling up to it: stopping
 * propagation here would starve that handler and the widget would stop responding. Such a panel
 * applies the per-control rule of `toolbar-keyboard.ts` itself instead.
 *
 * `role="presentation"`: it adds no semantics, only the handler (jsx-a11y accepts a handler on a
 * presentational element that is not itself interactive).
 */
export function ArrowKeysStayInPanel({
  children,
}: {
  children: React.ReactNode;
}): React.ReactElement {
  return (
    <div
      role="presentation"
      onKeyDown={(event) => {
        if (TOOLBAR_NAV_KEYS.includes(event.key)) event.stopPropagation();
      }}
    >
      {children}
    </div>
  );
}
