---
'@repo/web': patch
---

The plan's foot no longer rearranges itself when the activities panel opens. The facts, the activity
actions and the panel's own toggle are one row, in one place, in both states — expanding the panel
grows it upward instead of moving them.

Alongside that:

- Arming **Add**, **Level of effort** or **Link** no longer restates the tool's name below the
  diagram; the trigger you just pressed already says it. The gestures those sentences carried are on
  the trigger for screen readers, and **Click (Add armed) — place a one-day activity instead of
  dragging out its length** is now in the keyboard shortcuts sheet, where it had never been listed.
- The diagram shows one transient strip at a time. An edit conflict outranks an armed tool, which
  outranks the empty-plan prompt.
- The activity actions wear the same card as the command deck above them.
- The "who is editing this plan" sentence stays visible in the two states nothing else explains: when
  the pen is taken from you, and when somebody is asking you for it.
- Below 768 px the plan's facts, its finish date and its Recalculate button are back — they had gone
  missing on the narrowest screens.
