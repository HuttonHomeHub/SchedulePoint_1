# Claude agents

Specialised subagents for Blank App. Each lives in a Markdown file here with YAML
frontmatter (`name`, `description`, `tools`, `model`) and a system prompt. Claude
Code can delegate to them automatically based on their `description`, or you can
invoke one explicitly (e.g. "use the security-reviewer").

## Discovery

| Agent               | Use it when…                                                                                                                                                                    | Edits code?      |
| ------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------- |
| **feature-analyst** | A new idea/feature/requirement is raised. Run **first**: produces the Feature Spec + Implementation Plan per [`docs/PROCESS.md`](../../docs/PROCESS.md) and stops for approval. | Specs/plans only |

## Frontend agents

| Agent                      | Use it when…                                                                                                                                      | Edits code?    |
| -------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------- | -------------- |
| **ui-architect**           | Designing/evolving frontend architecture — feature module, state/data/routing, layout, or a frontend ADR. Run **before** building non-trivial UI. | Docs/ADRs only |
| **ux-reviewer**            | Reviewing a user-facing change for consistency, hierarchy, state coverage, copy, responsive behaviour.                                            | No (review)    |
| **accessibility-reviewer** | Auditing UI against WCAG 2.2 AA. Run after building interactive UI.                                                                               | No (review)    |
| **component-reviewer**     | Reviewing a component's API, composability, token/variant usage, tests; catching one-off styling.                                                 | No (review)    |
| **performance-reviewer**   | Frontend bundle size, code splitting, lazy loading, render efficiency, CWV.                                                                       | No (review)    |

## Backend agents

| Agent                            | Use it when…                                                                                                             | Edits code?            |
| -------------------------------- | ------------------------------------------------------------------------------------------------------------------------ | ---------------------- |
| **database-architect**           | Designing/changing the data model — Prisma models, migrations, indexes, constraints. Run **before** writing a migration. | Schema/migrations/docs |
| **api-reviewer**                 | Reviewing endpoints/DTOs for REST/OpenAPI conventions, status codes, envelopes, pagination.                              | No (review)            |
| **security-reviewer**            | Reviewing auth, RBAC + resource scoping (IDOR), validation, secrets, injection, rate limiting, Docker/deps.              | No (review)            |
| **backend-performance-reviewer** | Reviewing query efficiency (N+1/indexes), caching correctness, async/queue offload, transactions.                        | No (review)            |
| **test-engineer**                | Designing/writing tests (unit, API/Supertest, e2e) or assessing coverage.                                                | Tests                  |
| **devops-reviewer**              | Reviewing Dockerfiles, compose, GitHub Actions, release/versioning, secret handling.                                     | No (review)            |

## Typical flow

1. **Discover** — for any new requirement, run **feature-analyst** first to
   produce the spec + plan, then get approval (see `docs/PROCESS.md`).
2. **Design** a non-trivial change with **ui-architect** (frontend) or
   **database-architect** (data model).
3. Implement it, following the approved plan and the docs.
4. **Review** with the relevant reviewers — e.g. for an API change:
   **api-reviewer** + **security-reviewer** (+ **backend-performance-reviewer**,
   **test-engineer**); for UI: **component/accessibility/ux** reviewers.
5. Address **blocking** findings before merge.

Reviewers are read-only and report blocking vs. suggested findings with
file/line references; they never approve by silence. See each agent file for its
detailed checklist, and `CLAUDE.md` §20 for how they fit the workflow.
