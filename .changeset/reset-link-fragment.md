---
'@repo/api': minor
'@repo/web': minor
---

The password-reset link in the email now opens the app's own "Choose a new password" page directly, and the reset token is no longer sent to the server until you submit the new password. Links from earlier emails keep working. If a link has already been used or has expired, you are told so when you submit, with a way to request a new one.
