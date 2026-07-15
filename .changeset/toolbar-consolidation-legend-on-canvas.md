---
'@repo/web': minor
---

Consolidate the plan toolbar and move the diagram legend onto the canvas (ADR-0031 amendment). The
Link tool becomes a split-button that mirrors Add — one menu-button that picks the FS/SS/FF kind and
arms link-mode in a single gesture. Plan details and Edit plan fold into the Row-1 Summary popover
(status, data date and mode now sit above the schedule strip, with an Edit-plan shortcut), plus a
quick edit-pencil beside the status pill. Keyboard shortcuts move beside Legend on Row 1 and the
global `?` key opens them.

The legend now lives on the canvas: the Legend control toggles a floating, draggable key panel
overlaid on the diagram that can be positioned anywhere and pinned (its open state and position
persist), so the key stays visible while reading the plan. Plus polish — the finish chip no longer
wraps, "Coming soon" tooltips name their button, the zoom controls are more compact, and the search
field gets a little breathing room.
