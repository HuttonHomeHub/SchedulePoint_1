---
'@repo/web': patch
---

Extract the redesign's repeated patterns into shared primitives before any surface consumes
them, so "no one-off styling" survives the rest of the epic (ADR-0055, S1).

- `SegmentedControl` — the APG `radiogroup` lifted out of the workspace view toggle (roving
  tabindex, Arrow/Home/End, focus follows selection). Its caller keeps its exact behaviour.
- `ToggleChip` — an `aria-pressed` button for independent booleans, with the segmented-vs-chip
  rule written down: a radiogroup means "one of a set", a pressed button means "this is on",
  and using one for the other misdescribes the control even when it looks right.
- `CheckboxField` gains `density="compact"` for inline rows. Density is spacing only — the
  ≥24px hit target and the label association are unchanged and pinned by test.
- The Add control gains the split-button _look_ (a caret divider). Deliberately not a real
  split button: two focusable halves inside one toolbar item would re-open the roving-tabindex
  gate ADR-0031 closed. A test pins the single stop.
- `BrandMark` and `AccountChip` replace the header's product name, theme-cycling button,
  always-visible email and `outline` Sign-out button. Two Corporate contrast defects are fixed
  by deletion: the low-contrast email and the invisible Sign-out button no longer exist on the
  band — they live in a portalled menu that paints on the page's own colours. The theme becomes
  a radio group rather than a cycle, which is the first time the picker shows what the other
  options are.
