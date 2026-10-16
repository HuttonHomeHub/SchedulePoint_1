---
'@repo/api': patch
---

Restarting or stopping the API no longer logs a false "retention sweep failed" error. The sweep that runs at start-up used to be cut off mid-delete when the app shut down quickly, which looked exactly like a real database failure and counted towards the retention alert. The sweep now finishes the statement it is running, stops, and reports itself as stopped by shutdown; a real failure is still reported as before.
