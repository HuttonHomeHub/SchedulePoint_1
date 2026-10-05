---
'@repo/web': minor
---

Undo no longer gets stuck: a step that can't be undone is set aside and explained, and earlier steps still undo. Before it writes, an undo or redo now checks the activities and links it changed and writes back only what that step changed, so it never overwrites somebody else's edit or reverts an unrelated field. Your undo history is also kept when you hand the edit lock to a colleague and take it back, and redoing an added activity brings back the same one.
