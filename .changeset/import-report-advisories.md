---
'@repo/interchange': minor
'@repo/web': minor
---

The import report can now carry advisories: activities an import brought in faithfully that you
probably want to change afterwards, such as a task with no duration. The import review shows them in
an "Advisories" group after the approximations, repairs and drops, naming each activity by its code,
and they never block the import. No importer produces one yet. The review's finding lists and the
resource-name collision list are now announced as lists by screen readers that drop the role from
unstyled lists.
