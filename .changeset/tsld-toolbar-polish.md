---
'@repo/web': patch
---

TSLD toolbar UX polish: fix the missing critical-path settings, a mislabelled colour picker, a
duplicated icon, and an invisible row split.

**Bug fix — the plan's critical-path definition settings were unreachable.** `PlanScheduleSettings`
(critical-path definition, total-float measure, open-ends criticality — ADR-0035 §17/§18/§20) was
never migrated into the ADR-0031 toolbar workspace: it only rendered in the legacy
`CANVAS_TOOLBAR_ENABLED`-off fallback page, which the default-on flag means no user actually sees.
Its five sibling settings (recalc mode, expected-finish, levelling, external relationships, earned
value) all made the move into the toolbar's Calendar dialog; this one was dropped. It now joins them
there, following the same pattern.

**Clarity fix — the "Colour by" picker read as a fixed setting.** The toolbar button showed only the
active mode's bare name (e.g. "Criticality"), with "Colour by" appearing solely in the `aria-label`/
`title` — invisible to a sighted user, who could mistake it for a critical-path option living on the
toolbar. It now reads "Colour · Criticality", mirroring the existing "Isolating · {mode}" idiom used
by the neighbouring Isolate control.

**Icon fix — "Resource view" and "Resource histogram…" shared the same glyph** (`BarChart3`) despite
being two distinct commands visible across the toolbar's two rows. The histogram command now uses a
distinct icon.

**Discoverability — the toolbar's Look/Do row split was invisible.** Row 1 (view/navigate) and Row 2
(build/manage) were distinguished only by each row's `aria-label`, with no visible cue for sighted
users. Both rows now carry a small visible label matching their existing internal names.
