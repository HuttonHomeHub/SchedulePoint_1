# Fixture — the status header, in every shape the spec estate really uses

Every shape below was **counted** across the 91 spec documents at M0
(`docs/specs/spec-status-gate/m0-measurement.md`), not imagined. The counts are in the headings so a
reader can tell a real form from a defensive one. Expectations live in `doc-register.test.mjs`.

**This file is in `.prettierignore` and must stay there.** Two of its cases are malformed on purpose
and formatting would silently repair them, which is the ADR-0120 finding: a fixture that keeps its
name and loses its point.

## Bulleted — 87 of 91

- **Status:** Draft — awaiting approval before implementation

## Blockquoted — 2 of 91, `operational-self-service`

> **Status:** Approved

## Bare — 2 of 91, and the only form `fieldValue` can read

**Status:** Accepted (ADR-0130)

## Bold value — 3 of 91, and the reason the gate normalises a token

- **Status:** **Draft — awaiting approval.** Four CRITICAL questions in §1.

## Indented — a nested list item is not a declaration

  - **Status:** Draft

## Prose — the field named mid-sentence, not declared

The gate reads a **Status:** line from each spec, which this sentence is not one of.

## Fenced — a status inside an example is not a declaration

```md
- **Status:** Draft
```
