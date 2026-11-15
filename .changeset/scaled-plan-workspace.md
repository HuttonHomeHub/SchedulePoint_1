---
'@repo/web': minor
---

The plan view now shrinks to fit a window smaller than 1280 × 800 instead of rearranging itself. Between about 1024 × 600 and 1280 × 800 you see the same toolbar, diagram, Gantt and panel as on a larger screen, drawn smaller (never below 75 %), and a click or drag lands exactly where the pointer is. Dialogs, menus, the header, the Project Explorer and every other page keep their normal size. If you zoom the browser or enlarge its text, the plan view is not shrunk back: it stays at the size you chose. A new "Scaled to N %" button at the end of the plan's bottom row switches to actual size and back, and remembers your choice on this device, for browsers that do not tell the page when you have zoomed. The "designed for larger screens" page now says the designed size is 1280 × 800 and that the plan view shrinks to fit below it.
