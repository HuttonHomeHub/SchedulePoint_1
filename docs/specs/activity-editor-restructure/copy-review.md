# Field copy review — the tabbed activity editor

Decided 2026-07-29: fields are **reviewed for copy as they move** into tabs, not moved verbatim.
This document is the review. M3 implements it; nothing here changes behaviour, validation or the
wire format — only what the user reads.

Copy that is already good is listed as **keep**, with the reason, so a later reader can tell the
difference between "reviewed and kept" and "never looked at".

## The three findings that motivated a review rather than a move

**1. "(optional)" appears on eleven of twenty-two labels.** Code, WBS summary, Levelling priority,
Physical % complete, Budgeted expense, Actual expense, Constraint, Expected finish, External early
start, External late finish, Description. When half the form is marked optional the marker stops
carrying information and becomes visual noise — and it made the labels long enough to wrap in the
narrow dialog. Only **four** fields are actually required (Name, Type, Duration, and the two enums
that always have a value). **Mark the required ones; drop the rest.** This is the single biggest
legibility win in the review and it is nearly free.

**2. The tab now supplies context the label was carrying.** "Budgeted expense" on a tab called
**Cost**, beside "Actual expense", does not need to repeat "expense" — but it does need to keep it,
because the hint distinguishes a lump-sum activity expense from resource-derived cost, and dropping
the noun would make that distinction harder to state. So: shorten where the tab genuinely repeats
the label, keep where the word is load-bearing. Applied field by field below rather than as a rule.

**3. Two labels are ambiguous in ways the old layout hid.** "WBS summary" is the field for choosing
this activity's **parent**, and it sat eight fields below a **Type** picker whose options include
"WBS summary" — so the same phrase meant "what this activity is" in one place and "what it hangs
under" in another. And "Constraint" carried "(optional)" while "Secondary constraint" did not,
though both are optional; reuniting the pair on one tab (which this epic does) puts that
inconsistency side by side where it reads as a rule the user must infer.

## General tab

| Current                   | Proposed                      | Why                                                                                                                                                         |
| ------------------------- | ----------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `Name`                    | **keep**                      | Required, unambiguous.                                                                                                                                      |
| `Code (optional)`         | `Code`                        | Drop the suffix (finding 1).                                                                                                                                |
| `Type`                    | **keep**                      | Required.                                                                                                                                                   |
| `Duration (working days)` | **keep**                      | The unit belongs in the label, not the hint — a duration with an ambiguous unit is a scheduling error waiting to happen.                                    |
| `Duration type`           | **keep** label; **trim** hint | The hint is six lines and explains the whole P6 triad. Lead with what the user must decide, move the worked example to the second sentence, drop the third. |
| `WBS summary (optional)`  | **`Parent WBS summary`**      | Finding 3 — names the relationship, not the thing. Distinct from the `Type` option of the same name.                                                        |
| `Description (optional)`  | `Description`                 | Drop the suffix; move to the General tab's end where it reads as a note, not a trailing orphan.                                                             |

## Scheduling tab

| Current                           | Proposed               | Why                                                                                                                                                                                         |
| --------------------------------- | ---------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `Calendar`                        | **keep**               | Already correct; the combobox's "Plan default (inherit)" carries the nuance.                                                                                                                |
| `Constraint (optional)`           | **`Constraint`**       | Drop the suffix, and match the secondary (finding 3).                                                                                                                                       |
| `Constraint date`                 | **`Constraint date`**  | Keep. Appears only once a type is chosen, so it is never an orphan.                                                                                                                         |
| `Secondary constraint`            | **keep**               | Already consistent with the proposed primary.                                                                                                                                               |
| `Secondary constraint date`       | **keep**               | —                                                                                                                                                                                           |
| `Schedule as late as possible`    | **keep**               | A checkbox whose label states what it does. Its hint — "A display preference, not a date constraint" — is exactly the honest-copy standard this repo wants, and stays.                      |
| `Expected finish (optional)`      | `Expected finish`      | Drop the suffix. Hint keeps the "(Recalculate to apply)" caveat, which is load-bearing.                                                                                                     |
| `External early start (optional)` | `External early start` | Drop the suffix. Keep the P6-shaped term: planners recognise it, and inventing a friendlier name would break the shared vocabulary with the imported schedules these fields exist to carry. |
| `External late finish (optional)` | `External late finish` | As above.                                                                                                                                                                                   |
| `Levelling priority (optional)`   | `Levelling priority`   | Drop the suffix. Hint is already good — "Lower wins the resource…" states the rule and the blank behaviour.                                                                                 |

## Progress tab

The tab is new; its copy is written rather than reviewed. Two rules govern it, both from the agreed
design: every group says **what it does to the schedule**, and the manual physical field says **why
it is inert** when steps exist.

| Field                            | Copy                                                                         | Why                                                                                                                                                                                                                 |
| -------------------------------- | ---------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Group heading                    | **Reported progress** — "Moves the activity's dates."                        | The distinction the four-dialog scatter destroyed.                                                                                                                                                                  |
| Group heading                    | **How value is measured** — "Earns value in Earned Value. Changes no dates." | Same, in the negative.                                                                                                                                                                                              |
| `% complete type`                | **`Earn value from`**                                                        | The old label named its own data type; the new one names the decision. The three options (Duration / Units / Physical) read as the completion of the sentence.                                                      |
| `Physical % complete (optional)` | `Physical % complete`                                                        | Drop the suffix. When weighted steps exist the input is disabled and its hint becomes: **"Weighted steps are setting this to N%. Clear the steps to enter a value by hand."** — the reason, not a bare "Read-only". |
| Steps rollup (read-only)         | **`From weighted steps`**                                                    | Shown as a value, not an input, so the override is visible rather than merely effective.                                                                                                                            |
| `UNITS` pointer                  | "Units come from resource assignments — open **Resources** to change them."  | The third measure lives in another dialog; saying so beats leaving the user to guess.                                                                                                                               |

## Cost tab

| Current                       | Proposed           | Why                                                                                            |
| ----------------------------- | ------------------ | ---------------------------------------------------------------------------------------------- |
| `Budgeted expense (optional)` | `Budgeted expense` | Drop the suffix; keep the noun (finding 2 — the hint contrasts it with resource-derived cost). |
| `Actual expense (optional)`   | `Actual expense`   | As above.                                                                                      |
| `Cost accrual`                | **keep**           | Hint already states it changes when cost is recognised, "never a date".                        |

## Rules applied throughout

- **Sentence case** for labels and hints; no title case, no trailing colons.
- **Hints end in a full stop**; labels do not.
- **A disabled control always says what would enable it.** Never a bare "Read-only" — the specific
  failure this epic exists to fix (the physical % field is silently ignored today).
- **No em-dash-joined run-ons in hints.** Where a hint currently states two facts, split it.
- **Keep domain vocabulary** (SNET, external early start, levelling, accrual). These are the terms
  in the imported schedules and in P6; a friendlier synonym would be a private dialect.

## What this review deliberately does not change

The **required/optional semantics** of any field, the validation messages (those are tested and
their wording is asserted), the enum option labels in `ACTIVITY_TYPE_LABELS` / `CONSTRAINT_TYPE_LABELS`
/ `DURATION_TYPE_LABELS` — those are shared with the table and the canvas, so changing them here
would change three surfaces from one diff. If they need review, that is its own change.
