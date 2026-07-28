# Archive

Documents that were **true when written** and are kept for the record, not for
guidance. Nothing here is maintained. If an archived document disagrees with a
live one, the live one wins — and if it disagrees with the code, the code wins.

Read these to understand _why_ something was built the way it was. Do not read
them to learn how the system works today; use [`../README.md`](../README.md) for
that.

## What is here

| Path                 | What it is                                                                                        |
| -------------------- | ------------------------------------------------------------------------------------------------- |
| [`design/`](design/) | Interaction/UI design notes written mid-build for delivered TSLD and edit-lock work (2026 M2–M5). |

## What is deliberately _not_ here

**`docs/plans/`** holds the implementation plans for the same delivered
features, and by the rule above it belongs in this folder. It stays where it is
because **twelve accepted ADRs cite those paths**, and ADRs are immutable once
accepted (`docs/PROCESS.md` → Change management). Moving the files would turn a
dozen citations in the permanent decision record into dead links to fix a
tidiness problem. `docs/plans/README.md` marks the directory as historical
instead. The same reasoning keeps `docs/features/plan-edit-lock/`, cited by
ADR-0028.

That is a real inconsistency, and it is the cheaper of the two.

## The rule going forward

New feature work produces **one directory per feature** under
[`../specs/`](../specs/):

```text
docs/specs/<feature-slug>/
├── feature-spec.md          # Delivery process stages 1–4
└── implementation-plan.md   # Stage 5
```

Nothing new is written to `docs/plans/`, `docs/design/` or `docs/features/`.
When a feature ships, its spec directory **stays in `specs/`** — it is the
record of what was agreed, and moving it would break the same kind of citation
this folder exists to avoid. Archive a document only when it is actively
misleading and nothing immutable points at it.
