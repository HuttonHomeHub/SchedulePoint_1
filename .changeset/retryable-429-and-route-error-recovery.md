---
'@repo/web': patch
---

Retry a rate-limited read, and give the route error screen the way out its copy promises.

The query client refused to retry every 4xx, which is right for all but three of them: a 429 means
"this would have worked, come back in a moment", and 408/425 are about timing rather than content.
Both queries on the authenticated critical path inherit that default, so a rate-limited `GET /me`
was a hard failure rather than a retry — and it landed on an error screen reading "Please try
again" above nothing pressable, while the app's other error screen has always had a Reload button.

That screen now offers **Try again**, which clears the boundary and re-runs the route's loaders
without a page reload, so anything unsaved in a dialog behind it survives. A sustained rate limit
outlasts the automatic backoff by design; the button is what recovers it.
