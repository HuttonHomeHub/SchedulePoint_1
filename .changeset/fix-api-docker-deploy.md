---
'@repo/api': patch
---

Fix the API container build: `pnpm deploy` now passes `--legacy`. pnpm v10
changed `pnpm deploy` to require `inject-workspace-packages=true` (or `--legacy`)
and otherwise fails with `ERR_PNPM_DEPLOY_NONINJECTED_WORKSPACE`, which broke the
`api` image build. The `--legacy` flag restores the pre-v10 deploy behaviour the
multi-stage Dockerfile relies on.
