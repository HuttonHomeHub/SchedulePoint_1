---
'@repo/api': patch
---

Declare the 423 the resource-assignment routes can already return

`ResourceAssignmentService` asserts the plan edit-lock on create, update and delete, and an e2e case
pins it — but none of the three routes carried `@ApiLockedResponse`, so the OpenAPI document did not
mention the status. A client generated from the spec had no branch for it. Documentation only: no
behaviour, permission or schema change. Closes TECH_DEBT #61.
