---
'@repo/web': minor
---

An Org Admin can now download the whole organisation from the app: **Export data** is a new place in the left panel (and in its icon strip), and its page has a **Download export** button that saves one ZIP, shows how much has arrived, can be cancelled, and says plainly why a refusal happened (not an Org Admin, already exporting, server busy, too many in a short time). The web image's nginx now gives that one route its own settings: the ZIP is passed straight through instead of being stored on the proxy first, and a long export is allowed up to 11 minutes before the proxy gives up. Nothing changes for other routes.
