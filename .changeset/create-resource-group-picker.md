---
'@repo/web': patch
---

Fix the new-resource dialog's Group picker, which could only ever offer "No group (top level)". The
create host never passed the organisation's groups to the dialog while the edit host did, so a
resource could not be filed into a group at the moment it was created — only by editing it
afterwards. It now reads the groups directly, and the closed-state target sizes of a native
`<select>` and the hand-rolled combobox are recorded as measured on a coarse pointer.
