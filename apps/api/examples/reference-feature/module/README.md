# reference module (TEMPLATE)

The **canonical feature template** for the Blank App API. `ReferenceItem` is not a
business entity — it demonstrates every backend standard in one small,
fully-tested feature. See [`docs/REFERENCE_FEATURE.md`](../../../../../docs/REFERENCE_FEATURE.md)
for the full standard-by-standard map.

## Layout

```text
module/
├── reference.module.ts        # DI wiring: controller → service → repository
├── reference.controller.ts    # HTTP surface (thin): DTOs, permissions, status codes
├── reference.service.ts       # Business logic: authz scope, locking, logging
├── reference.repository.ts    # Data access: soft-delete filter, optimistic lock
├── reference.service.spec.ts  # Unit tests (repository mocked)
├── reference-permissions.ts   # This feature's permission codes + role mapping
└── dto/
    ├── create-reference-item.dto.ts
    ├── update-reference-item.dto.ts       # includes `version` (optimistic lock)
    ├── list-reference-items-query.dto.ts  # pagination + filter + sort
    └── reference-item-response.dto.ts      # safe representation (no internal columns)
```

The e2e test lives alongside this module at
[`../reference.e2e-spec.ts`](../reference.e2e-spec.ts). This is a **non-shipping
template** (ADR-0014) — copy `module/` into `src/modules/<feature>/` to build a
real feature; see the [parent README](../README.md).

## Endpoints (`/api/v1/reference-items`)

| Method | Path   | Permission         | Notes                          |
| ------ | ------ | ------------------ | ------------------------------ |
| POST   | `/`    | `reference:create` | 201; returns the created item  |
| GET    | `/`    | `reference:read`   | Cursor-paginated list          |
| GET    | `/:id` | `reference:read`   | 404 if missing/soft-deleted    |
| PATCH  | `/:id` | `reference:update` | Optimistic lock (409 on stale) |
| DELETE | `/:id` | `reference:delete` | 204; soft delete               |

All routes require an authenticated principal with the permission **in the
organisation that owns the resource**.

> **Delete this module** once real features make it redundant — it exists only
> to teach the patterns.
