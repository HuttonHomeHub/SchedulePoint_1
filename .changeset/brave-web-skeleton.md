---
'@repo/web': minor
---

Land the web application entry point and the authentication walking skeleton:
Vite + React app shell, design tokens, TanStack Router (code-based) with an
`_authed` guard, TanStack Query, theme (light/dark/system) with no flash of the
wrong theme, and accessible sign-in / sign-up forms (React Hook Form + Zod) via
the Better Auth client. A signed-in user reaches an app shell (header, current
user, sign-out); unauthenticated visits are redirected to sign-in. Covered by a
component test and a Playwright journey with an axe accessibility check; CI now
builds and end-to-end tests the web app.
