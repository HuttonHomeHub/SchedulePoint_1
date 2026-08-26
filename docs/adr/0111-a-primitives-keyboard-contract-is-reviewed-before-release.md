# ADR-0111 — A shared primitive's keyboard contract is reviewed before release, not after

- **Status:** Accepted
- **Date:** 2026-08-26
- **Supersedes:** nothing
- **Amends:** ADR-0110 (which established that a gate is verified against the defect it names; this
  says what to do about the defects no gate can see)

## Context

Twice in two days, a change to a shared primitive's keyboard model passed every automated gate, a
human read and a real-browser journey, and was wrong. The second time it was wrong **inside the fix
for the first**, and the fix had already been released.

**Instance 1 (`docs/TECH_DEBT.md` #189).** `Deck`'s key handler vetoed all six navigation keys
whenever focus sat on a form field. Correct for a `<textarea>`. For the deck's single-line search
`<input>` it meant **18 of 27 commands had no keyboard route at all** (WCAG 2.2 §2.1.1, level A),
because focusing that field also makes it the roving stop and the deck's only Tab entry point.
Shipped in `web-v0.103.0`.

**Instance 2 (#192).** The fix narrowed the veto by `tagName` alone. The shipped `Go to date`
control renders `<input type="date">` inside that same deck, and a date input steps its focused
segment with the vertical arrows — so pressing ArrowUp changed no date and threw focus onto an
unrelated command. **Worse than the defect it replaced**: #189 meant a command could not be
_reached_; this destroyed an interaction already open. Shipped in `web-v0.106.0` and live for about
ninety minutes.

**What saw them, and what did not.**

| Instrument                       | #189                                         | #192                                                       |
| -------------------------------- | -------------------------------------------- | ---------------------------------------------------------- |
| Unit suites (jsdom)              | missed — `Deck` had **no unit suite at all** | missed — the new suite tested a text input, not a date one |
| Playwright journeys              | missed                                       | missed                                                     |
| The ten `check:*` gates          | not their subject                            | not their subject                                          |
| `axe`                            | missed — neither is an axe rule              | missed                                                     |
| Human read                       | missed, twice                                | missed                                                     |
| An adversarial specialist review | **found #189's sibling**                     | **found it, twice, independently**                         |

Both were found in minutes by reviewers who executed the components rather than reading them. Two
separate agents reached #192 independently, one reproducing it in real Chromium.

## Decision

**A change to a shared primitive's keyboard or focus contract gets a specialist review before it is
released.** Not after, and not at the next epic's gate pass.

"Shared primitive" means anything in `apps/web/src/components/ui/` that owns a roving `tabindex`, a
focus trap, an arrow-key model or focus restoration — today `Deck`, `Toolbar`, `Menu`, `Combobox`,
`Tabs`, `Dialog` and the `*Field` family. "Keyboard or focus contract" means which keys the
component claims, which it passes on, where focus goes when something opens, closes, unmounts or
becomes disabled, and what is in the tab sequence.

The review is `accessibility-reviewer`, and `component-reviewer` as well whenever the change touches
a rule that more than one primitive implements.

## Why this and not a gate

**Because it cannot be a gate, and saying so is the point.** ADR-0058's standing instruction is to
prefer a computed gate to a checklist item, and this decision deliberately does not follow it — so
it owes an argument.

Every one of these defects is a statement about **what a real browser does with a real focus ring**:
that a single-line input ignores the vertical arrows, that a date input does not, that a modal
dialog's top layer swallows a portalled menu, that `preventDefault` without `stopPropagation` still
reaches an ancestor through the React tree. jsdom has no layout, no top layer and no focus ring, so
the unit tier structurally cannot ask. The journey tier can, but only about the paths somebody
thought to drive — and nobody writes a journey for "press ArrowUp in the date field", because the
defect is only visible once you already suspect it.

A gate could be built for any **individual** rule after it is known. That is what `#192`'s tests
are, and they will hold. What cannot be gated is the **next** rule — the one nobody has thought of,
which is every instance so far.

So this is the weak instrument (§19.11), and it is labelled as one. Its whole value is that it is
cheap: two agent runs against a diff, minutes, before a release rather than after.

## Consequences

- One extra step on a narrow class of change. It does not apply to feature code, to a consumer of a
  primitive, or to styling.
- `docs/TESTING.md` and `CLAUDE.md` §19 carry the rule; `.claude/agents/accessibility-reviewer.md`
  and `component-reviewer.md` already cover the subject matter and need no change.
- **It will not catch everything, and the honest failure mode is naming it and then not doing it** —
  which is exactly what happened between #189 and #192, since ADR-0110's own gate pass had run days
  earlier and the fix was written after it. A rule whose trigger is "I am about to change a
  primitive's keyboard model" depends on noticing that that is what you are doing.
- **The CPM engine is not imported and no migration runs.**
