---
'@repo/web': minor
---

Add a "Measure plan loading" control to the staff console's Performance panel. One press reloads the page, then navigates it once more, and reports how many of the plan screen's code files this browser fetched from the network, revalidated or reused from cache, over which protocol, and under which `Cache-Control` header. It makes no request to the API and opens no plan.
