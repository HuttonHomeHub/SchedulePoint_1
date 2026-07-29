---
'@repo/web': minor
---

Give every dialog a layout instead of a list of fields (ADR-0061).

Dialog bodies were all the same shape — one `flex flex-col gap-4` around one field or around nine —
so the structure said nothing about which fields belonged together or which mattered. Both the
four-tab activity editor and the eight-field resource form were 448px wide, because `Dialog`
defaults to `max-w-md` and neither passed a size.

- New shared primitives (`FormSection`, `FieldGrid`, `ContextStrip`) carry the grouping, so it is a
  rule rather than something each dialog reinvents. Field groups are now named and announced as
  groups; controls that form one decision — a constraint and its date, a lag and the calendar
  counting it — sit side by side.
- The activity editor moves to a two-pane layout at a new `xl` size: a rail showing every scope
  **and its state**, so a Contributor sees which sections are read-only on arrival rather than
  discovering each by clicking into it. Its computed dates, float and criticality now stay on
  screen while you edit them.
- Applied across the activity form, resources, calendars, dependencies, cross-plan links, share
  links and schedule import. Confirm and reference dialogs are deliberately unchanged.
- `(optional)` leaves the remaining labels; section descriptions say it in a sentence where it
  matters.
