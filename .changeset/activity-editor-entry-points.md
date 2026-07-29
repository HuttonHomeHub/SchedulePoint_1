---
'@repo/web': minor
---

Converge the activity editor's entry points (ADR-0060 M5). Edit, Report progress and Steps — from the
activities row menu, the canvas selection bar and the plan toolbar — now build one `ActivityEditorIntent`
and open one editor on the tab that answers the action, instead of three dialogs driven by three pieces
of state. The per-scope gate is derived once by the plan workspace and passed to every host, so the
role-versus-pen reason a shaded control shows cannot differ between the table and the canvas.
