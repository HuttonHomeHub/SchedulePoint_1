---
'@repo/api': patch
---

A request to a route that does not exist now answers `{"error":{"code":"NOT_FOUND","message":"Not found"}}` instead of echoing the method and path, so it matches what a non-staff caller gets from the staff routes.
