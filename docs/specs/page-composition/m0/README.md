# M0 measurement outputs

Raw instrument output for `../m0-measurement.md`. Read that first; these are its evidence.

**`column-fit-1646.rejected-first-run.*` is NOT a measurement of the product.** It is the record of
the wrap probe's first run, kept because it is the evidence for two findings and because deleting a
rejected run leaves the document's claims unsupported:

- it reported **zero** wrapping on Calendars and Resources, because the shared fixture seeded one
  calendar and no resources at all (`m0-measurement.md` §2.1) — and its pinned positive case
  correctly refused a verdict rather than letting that read as "the columns are fine";
- and it reported a cell containing the single word `Edit` as two lines, which is what sent the
  probe's line-counting back to the drawing board (§2.2).

Both faults are in the instruments, not in the product. Nothing in this file should be quoted as a
fact about a screen.

## Why the pinned-case line is in a sibling `.txt`

The probe writes its verdict to **stderr** and its data to stdout, so a run captured with `2>&1`
lands a sentence after the closing brace and the file stops being JSON. The verdict is worth keeping
— it is the proof that the instrument could still see the defect when the numbers were taken — so it
is split into `*.pinned-case.txt` rather than dropped.
