---
'@repo/web': patch
---

Surface load failures on the cross-plan link picker, and stop a nested dialog closing its `Sheet`.

The four cascade pickers in **Add cross-plan link** (client → project → plan →
activity) were still hand-rolled `Label`+`Select` blocks. A failed clients query
rendered an error paragraph with no `id`, so it was never linked to the select
and never reached assistive technology; failures on the project, plan and
activity queries were not surfaced at all, leaving the control stuck on its
placeholder with no explanation. All four now use `SelectField`, with the load
failure announced (`role="alert"`) and the validation message left to the form's
error summary.

`Sheet` also gains the close-scoping guard `Dialog` received: a dialog nested
inside a sheet would otherwise close the sheet out from under it. No screen does
that today, so this is latent rather than a live fix.
