---
'@repo/web': minor
---

Turn the tabbed activity editor on by default (ADR-0060 M6, `VITE_ACTIVITY_EDITOR_TABS`). The
activity's General, Scheduling, Progress and Cost fields now live on four tabs that save per write
scope, and the progress model — the reported %, the value measure, and the weighted steps that
override it — is co-located on one tab instead of spread across four dialogs.

Four specialist reviews over the combined diff found six defects in code that had already passed a
human read, all folded before the flip: a dropped calendar Combobox with its loading and error
states, Save buttons that lost focus on every save, a reason sentence placed beside its control
rather than associated with it, an invented edit-lock message that was false whenever nobody held
the lock, no confirmation before discarding unsaved work, and a save bar duplicated across two files
that had already begun to diverge. A flag-on Playwright journey with its own CI step proves the
permission model end to end against a real API.

`VITE_ACTIVITY_EDITOR_TABS=false` restores the previous three dialogs exactly, pinned by parity
suites.
