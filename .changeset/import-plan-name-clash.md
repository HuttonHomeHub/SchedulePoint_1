---
'@repo/api': patch
---

Importing a schedule whose plan name the project already uses is now refused at the preview, and at commit, with "A plan with this name already exists for this project." instead of the generic "That would duplicate an existing record".
