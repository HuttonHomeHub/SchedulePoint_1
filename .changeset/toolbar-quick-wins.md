---
'@repo/web': minor
---

TSLD toolbar quick-wins — five previously-"Coming soon" toolbar buttons are now wired to already-shipped
features, **on by default** (`VITE_TOOLBAR_QUICK_WINS`, set it to `false` to restore the placeholders).
Frontend-only: no API, schema, `@repo/types`, or CPM-engine change; the recalc parity gate is untouched.

- **Go to today** — pans the canvas to today's date line (the `goToDate` left-inset view jump); view-only,
  available to every role.
- **Comments** — reveals and focuses the plan-level notes thread (behind `VITE_NOTES`).
- **Update progress…** — opens the activity progress editor for the selected activity (Contributor+).
- **Add note** — opens the selected activity's Logic panel at its Notes section (behind `VITE_NOTES`).
- **Clear visual placement** — drops the selected bar's hand-placed `visualStart` back to the computed
  date (Visual mode, pen-gated); announces success and surfaces a stale-version conflict non-destructively.

The canvas selection is lifted into the workspace so the toolbar's selection-aware items enable only when
an activity is selected (each with its own role / pen / mode gate and an exposed disabled reason). Every
action reuses an existing REST mutation, so the server stays the sole trust boundary. WCAG 2.2 AA; covered
by unit tests. `VITE_TOOLBAR_QUICK_WINS=false` ships the five ids as their prior "Coming soon" placeholders,
byte-for-byte.
