# Templates

Reusable templates for the [delivery process](../PROCESS.md). Copy a template
and fill it in. **A feature gets one directory** —
`docs/specs/<feature-slug>/` — holding `feature-spec.md` and
`implementation-plan.md` side by side. (`docs/plans/` is where early features
put their plan; it is historical and nothing new goes there.)

| Template                                         | Purpose                                                                                         | Process stage     |
| ------------------------------------------------ | ----------------------------------------------------------------------------------------------- | ----------------- |
| [feature-spec.md](feature-spec.md)               | Business understanding, functional requirements, technical analysis, and solution design        | Stages 1–4        |
| [implementation-plan.md](implementation-plan.md) | Epic → Milestone → Feature → Task → Steps breakdown with complexity, dependencies, risks, tests | Stage 5           |
| [../adr/_template.md](../adr/_template.md)       | Architecture Decision Record                                                                    | Change management |

A worked example applying these end-to-end (no code) is in
[`../examples/example-manage-items.md`](../examples/example-manage-items.md).

> Templates are the _shape_ of the artifact, not a checklist to pad. Delete
> guidance comments and any section that genuinely doesn't apply — but don't skip
> a section to avoid the thinking it demands.
