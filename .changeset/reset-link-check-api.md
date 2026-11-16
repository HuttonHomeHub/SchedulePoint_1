---
'@repo/api': minor
---

A new public endpoint, `POST /api/v1/password-reset/check`, tells the password-reset page whether an emailed link can still be used. It never uses the link up and answers the same way whether the link was spent, expired or never existed.
