---
'@repo/api': minor
'@repo/types': minor
'@repo/web': patch
---

A resource group can now be dissolved through the API: `POST /api/v1/organizations/:orgSlug/resources/:resourceId/dissolve` removes the group and keeps everything directly inside it, moving those resources up to the group's own parent (or the top level). Planners and Org Admins can do it; a resource that is not a group is refused. Unlike deleting a group, nothing inside it is lost, and no plan's dates can change. Resources have no recycle bin, so a dissolved group cannot be restored, only created again. Each dissolve is written to the organisation audit log as "Group dissolved", with how many resources were kept and where they went. No screen offers it yet.
