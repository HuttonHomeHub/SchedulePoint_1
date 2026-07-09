# ADR-0001: Record architecture decisions

- **Status:** Accepted
- **Date:** 2026-07-08
- **Deciders:** Founding maintainers

## Context

Blank App is intended to be maintained by multiple engineers over many years. The
reasoning behind significant technical decisions is easily lost, leading to
re-litigation of settled questions and accidental erosion of intent. We want a
durable, low-friction way to capture _why_ decisions were made.

## Decision

We will record architecturally significant decisions as **Architecture Decision
Records (ADRs)**, stored in `docs/adr/`, following Michael Nygard's format.

- Each ADR is a numbered Markdown file (`NNNN-title.md`) using
  [`_template.md`](_template.md).
- ADRs are **immutable once accepted**. To revisit a decision, we add a new ADR
  that supersedes the old one and update the old one's status accordingly.
- Smaller decisions that don't warrant a full ADR go in
  [`docs/DECISIONS.md`](../DECISIONS.md).

## Alternatives considered

- **A wiki / external doc tool** — decouples rationale from the code and version
  history; drifts easily. Rejected.
- **Only commit messages / PR descriptions** — hard to discover and browse as a
  set; rejected in favour of a first-class, in-repo record.

## Consequences

- Contributors invest a little effort per significant decision.
- Future maintainers gain a browsable, versioned history of _why_.
- Reviewers can require an ADR when a change is architecturally significant.

## References

- Michael Nygard, "Documenting Architecture Decisions".
- [`CLAUDE.md` §16](../../CLAUDE.md)
