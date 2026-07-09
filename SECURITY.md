# Security Policy

We take the security of Blank App and its users' sensitive data seriously.

## Supported versions

While the project is pre-1.0, only the latest release on `main` receives
security fixes. This table will be maintained as versions are released.

| Version              | Supported      |
| -------------------- | -------------- |
| `main` (unreleased)  | ✅             |
| `< 1.0` pre-releases | ⚠️ latest only |

## Reporting a vulnerability

**Please do not open a public issue for security vulnerabilities.**

Report privately via GitHub's
[**Report a vulnerability**](https://github.com/HuttonHomeHub/blank-app/security/advisories/new)
(Security → Advisories). If you cannot use that channel, contact a maintainer
directly.

Please include:

- a description of the issue and its impact,
- steps to reproduce or a proof of concept,
- affected component/version, and
- any suggested remediation.

### What to expect

- **Acknowledgement** within 3 business days.
- An initial **assessment** within 7 business days.
- Coordinated disclosure: we will agree a timeline with you and credit you
  (unless you prefer to remain anonymous) once a fix is released.

Please act in good faith: give us reasonable time to remediate before public
disclosure, and avoid privacy violations, data destruction, or service
degradation while testing.

## Security practices in this repository

- **Secrets** are never committed. Configuration is supplied via environment
  variables / a secrets manager. `.env` is git-ignored; `.env.example` documents
  the shape only.
- **Static analysis:** CodeQL runs on every push/PR and weekly.
- **Secret scanning & push protection** are expected to be enabled on the repo.
- **Dependency updates** are automated via Dependabot; security updates are
  prioritised.
- **Input validation** at every boundary (DTO validation + Prisma parameterised
  queries). No hand-built SQL.
- **Transport & headers:** HTTPS in all deployed environments; Helmet (API) and
  hardened nginx headers (web).
- **Authentication:** Better Auth with hashed credentials and secure, http-only,
  same-site cookies; CSRF protection on state-changing requests.
- **Least privilege:** scoped database roles, non-root container users, and
  minimally-scoped CI tokens.

See [`CLAUDE.md` §14](CLAUDE.md) for the full security requirements.
