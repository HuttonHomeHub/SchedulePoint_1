---
'@repo/web': patch
---

fix(web): dock the plan-notes panel instead of overlaying it

The **Comments** toolbar button opened plan notes as a modal-less `<dialog>` side-sheet that
mispositioned over the canvas, obscured the workspace, and did not toggle shut. It now behaves like the
activities and Project Explorer panels — a docked, resizable RIGHT panel that participates in the layout
and pushes the canvas rather than overlaying it.

- Notes render in a resizable right column (persisted width via `useNotesPanelPrefs`) with an
  end-anchored `PanelResizer` (`reverseKeys` so keyboard resize matches the pointer). Below `md` the
  panel takes the single pane.
- **Comments** is now a genuine toggle carrying `aria-pressed` (reflects `notesOpen`), replacing the
  one-way `aria-haspopup="dialog"` opener; closing returns focus to it, and Escape closes the dock.
- `PlanNotesSection` gains a `chromeless` mode so the panel's `SheetHeader` is the single header and its
  `<section>` the sole landmark (no nested card / duplicate heading).
- Removes the now-dead overlay-sheet machinery (`Sheet` modal-less path, the `HTMLDialogElement.show`
  test shim, and the toolbar `ariaHasPopup` plumbing).

Behind `VITE_ENTRY_ROUTES` (default on); flag-off the inline notes block is byte-for-byte unchanged. No
API or schema change.
