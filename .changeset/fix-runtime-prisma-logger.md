---
'@repo/api': patch
---

Fix two production-image runtime crashes. The generated Prisma client was missing
from the deployed image (`pnpm deploy` rebuilds node_modules from the store and
drops it), so the API crashed with "@prisma/client did not initialize yet" — the
Dockerfile now regenerates the client inside the deployed tree. And the logger
no longer crashes in development mode when `pino-pretty` (a devDependency, absent
from the production image) can't be loaded: it falls back to JSON logging.
