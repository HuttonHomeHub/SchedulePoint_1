---
'@repo/web': minor
---

Controls meet the 44 px house rule under a coarse pointer, and nothing changes for a mouse.

`--control-h` and `--control-h-sm` gain a `@media (pointer: coarse)` axis — a third kind of token
declaration alongside the theme block (what is this value) and the surface rebinds (whose value is
it), because neither can answer what the reader is pointing with. The command deck, the plan header,
the Project Explorer, form controls, combobox options and menu items all take it; the fine-pointer
default stays 36 px. Measured: a mouse user loses 0 px of diagram, a touch user 16 px of 808 (2.0 %).

Two defects were found on the way and are fixed here. At a 390 px viewport `Gantt` and
`Stop editing` laid out entirely outside the viewport — painted, focusable and unclickable — so a
planner on a phone could neither switch view nor release the pen. And the dialog close was 36 px
wide, from a raw glyph in a text-sized button; it is now the icon button its `Sheet` sibling has
always used.

Three floating canvas panel controls that were 28, 40 and 44 px unify on one size.
