---
'@repo/api': patch
---

Sign-in, sign-up and the other account routes now refuse a request body larger than 64 KB with the same "too large" error as the rest of the API. Before, an anonymous caller could make the server read a body of any size on those routes.
