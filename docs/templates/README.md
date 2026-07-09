# Templates

Reusable templates for the [delivery process](../PROCESS.md). Copy a template,
fill it in, and store the filled copy where the team can review it (a
`docs/specs/` or `docs/plans/` file, or attached to the tracking issue).

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
