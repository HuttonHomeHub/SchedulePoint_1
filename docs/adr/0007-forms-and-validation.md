# ADR-0007: Forms and validation

- **Status:** Accepted
- **Date:** 2026-07-08
- **Deciders:** Frontend architecture

## Context

Applications built on this base tend to be form-heavy (creating/editing records, settings, multi-step flows). Forms
are where accessibility, validation, and UX most often regress. We need a
consistent approach that is performant, accessible, and shares validation logic
with the API where possible.

## Decision

- **[React Hook Form](https://react-hook-form.com) (RHF)** for form state.
  Uncontrolled inputs minimise re-renders (performance) and it has strong
  accessibility affordances.
- **[Zod](https://zod.dev)** for schema validation, wired via
  `@hookform/resolvers`. Schemas are the single source of truth for a form's
  shape and rules, and infer the TypeScript type.
- **Shared contracts.** Where a form mirrors an API payload, the Zod schema (or
  its inferred type) is shared through `@repo/types` so the client and server
  agree on shape and constraints — no divergence.
- **Accessible form primitives.** A `Form` wrapper (shadcn/ui pattern) binds
  labels, descriptions, and error messages to controls with `aria-describedby`
  / `aria-invalid`, focuses the first invalid field on submit, and renders a
  consistent error summary. All forms use it — no bespoke form markup.
- **Submission** goes through TanStack Query mutations (ADR-0004) for loading,
  error, and optimistic-update handling.

## Alternatives considered

- **Formik** — historically popular but heavier and less actively developed;
  more re-renders than RHF. Rejected.
- **Controlled `useState` forms** — verbose, error-prone, poor for large forms.
  Rejected.
- **Yup / valibot** — Zod chosen for its TypeScript-first inference, ubiquity,
  and easy sharing across the API boundary. Valibot is a reasonable future
  option if bundle size becomes critical.

## Consequences

- **Positive:** performant, accessible-by-default forms; one validation source
  shared client↔server; typed values end to end.
- **Negative / risks:** engineers must define a Zod schema per form and use the
  `Form` primitive; enforced by the Accessibility and Component Reviewer agents.

## References

- `docs/FRONTEND_ARCHITECTURE.md` (Form handling), `docs/DESIGN_SYSTEM.md`
  (Forms), ADR-0004
