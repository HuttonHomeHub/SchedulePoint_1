# ADR-0011: File storage via an S3-compatible abstraction

- **Status:** Accepted
- **Date:** 2026-07-08
- **Deciders:** Backend architecture, Security

## Context

Blank App will handle user files (e.g. receipts/attachments). Files must not live in
the application container (ephemeral, unscalable) or in the database (bloats
backups, poor streaming). We also don't want to couple to one cloud provider
before the hosting platform is chosen (`docs/TECH_DEBT.md`).

## Decision

Store files in **object storage** behind a `StorageService` interface, using the
**S3 API** as the contract (AWS S3, Cloudflare R2, MinIO, etc. all satisfy it;
MinIO in local `docker-compose`).

- **Abstraction:** product code depends on `StorageService`
  (`put`/`get`/`delete`/`getSignedUrl`), never a vendor SDK directly.
- **Direct, pre-signed transfers:** clients upload/download via short-lived
  **pre-signed URLs**; large payloads never stream through the API.
- **Metadata in Postgres, bytes in object storage.** The DB row holds the key,
  content type, size, checksum, and audit fields; the bytes live in the bucket.
- **Security:** private buckets by default; validate content type and size
  server-side; generate random, non-guessable keys; scan/validate untrusted
  input; time-boxed signed URLs. No public ACLs.

## Alternatives considered

- **Local/container filesystem** — not durable or horizontally scalable.
  Rejected (dev-only at most).
- **Bytes in Postgres (BYTEA/large objects)** — bloats the DB and backups, poor
  for streaming/CDN. Rejected.
- **A specific cloud SDK (e.g. AWS SDK) directly in code** — vendor lock-in
  before the platform decision. Rejected in favour of the interface.

## Consequences

- **Positive:** durable, scalable storage; provider-portable; API stays
  lightweight; secure-by-default access via signed URLs.
- **Negative / risks:** an object store must be operated/provisioned; signed-URL
  flows add a step to upload/download UX (documented when the feature lands).

## References

- `docs/BACKEND_ARCHITECTURE.md` (File storage), `SECURITY.md`,
  `docs/SECURITY_STANDARDS.md`
