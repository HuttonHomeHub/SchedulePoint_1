---
'@repo/web': minor
---

Split `--input` from `--border` so a control's outline is visible (WCAG 1.4.11)

`--input` shared `--border`'s value, and because `--field` is deliberately identical to the
surface it sits on, a text field's outline — the only thing indicating a field is there — sat at
**1.26:1** in every theme, on every surface. It is now its own per-surface token held at ≥ 3:1 by
the contrast suite, which previously reported the border ratio without asserting it and so never
looked at this one. Reach for `border-input` on anything whose edge identifies a control;
`border-border` is for dividers.

Two further computed defects fixed in the same pass: `bg-muted text-muted-foreground` inside the
Corporate chrome resolved to a light grey on a light grey (**1.81:1**), because the surface
families carried `-muted-foreground` with no `-muted` fill of their own — `-muted` now joins the
family. Corporate's solid warning fill carried a white label at **3.61:1**, and the light
secondary grey missed 4.5:1 against `--muted`; both values were corrected.

The theme options in the account menu are now a named `role="group"`, so the visible "Theme"
heading relates to them programmatically and not only by proximity (WCAG 1.3.1).
