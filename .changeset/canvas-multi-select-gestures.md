---
'@repo/web': minor
---

Canvas multi-select — pointer gestures and keyboard parity (behind `VITE_CANVAS_MULTI_SELECT`,
default off).

Ctrl/Cmd-click toggles a bar in or out of the selection, Shift-click extends a span in plan order,
and a marquee sweep selects what its rectangle covers — armed by holding Ctrl/Cmd on empty ground,
or by a new **Marquee select** tool on the diagram toolbar. The tool joins the ADR-0064 arm/disarm
contract (Escape returns to Select, the mode band states it, the transition is announced) and is
deliberately not pen-gated: selecting is a read, so a Viewer can sweep.

The parallel activity listbox becomes multi-selectable in step: `Space` toggles the focused
activity (its logic summary moves to `i`), `Shift+↑/↓` extends, `Cmd/Ctrl+A` selects everything, and
`Escape` clears the selection after any armed tool has been closed. `aria-selected` reflects the
whole set rather than the keyboard cursor.

Flag-off, every one of these paths is unreachable and the canvas paints call-for-call what it did
before.
