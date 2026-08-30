---
'@repo/web': patch
---

The plan header's mode row now says which of its buttons are alternatives.

`Early mode | Visual mode` and `Diagram | Gantt` are two independent two-way switches, and the
toolbar taxonomy put all four in one group — one region, one name, four identical gaps, so nothing
said where one switch ended. They are now two named groups, `Scheduling mode` and `Plan view`,
separated by the hairline the toolbar already draws between groups.

The divider was measured before it shipped: `aboveCanvas` is unchanged at every width, as an
equality rather than a bound.
