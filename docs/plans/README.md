# Implementation plans (historical)

**Nothing in this directory is maintained, and nothing new belongs here.**

These are the stage-5 implementation plans for features that have since shipped.
They were accurate when written and are kept because **twelve accepted ADRs cite
these paths** — ADRs are immutable once accepted, so relocating the files would
turn citations in the permanent decision record into dead links. That is the
only reason this directory still exists at the top level rather than under
[`../archive/`](../archive/README.md).

Each plan has a matching feature spec of the same name in
[`../specs/`](../specs/).

**Going forward, a feature gets one directory** —
`docs/specs/<feature-slug>/{feature-spec.md,implementation-plan.md}` — which is
what every epic since has done. See [`../PROCESS.md`](../PROCESS.md).

If you are reading one of these to find out how something works today: don't.
The plan describes what was intended at the time, including tasks that were
re-scoped during the build. [`../ARCHITECTURE.md`](../ARCHITECTURE.md) and the
code are the current answer.
