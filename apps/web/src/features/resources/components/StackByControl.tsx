import type { StackBy } from '../model/stack-series';

import { Label } from '@/components/ui/label';
import { Select } from '@/components/ui/select';

/**
 * The `Stack by` picker, shared by the dialog and the canvas strip.
 *
 * **One component rather than one per surface**, for the reason this epic keeps returning to: two
 * copies of a control drift, and the drift is invisible because each looks right alone. It is also
 * the shape of the defect ADR-0093 removed — a second copy of an action that nobody chose to have.
 *
 * A native `<select>`, matching the resource picker beside it. Note for reviewers: CLAUDE.md §19.13
 * targets HAND-ROLLED primitives (`Deck`, `Menu`, `Combobox`, `Tabs`, `Dialog`, `*Field`), so it
 * does not apply here — a native control's keyboard model is the platform's. Adding an option is
 * still not risk-free on NAMING, which is what the strip's disclosure label had to be fixed for.
 */
export function StackByControl({
  id,
  value,
  onChange,
  groupsAvailable = true,
}: {
  id: string;
  value: StackBy;
  onChange: (next: StackBy) => void;
  /**
   * False when the organisation's resource library holds no `GROUP` node, which makes **one**
   * option a no-op rather than the control.
   *
   * **It shades that option, never the select** (2026-09-01). It disabled the whole control until
   * `Kind` existed, which was right while `Group` was the only alternative to `Resource` and became
   * wrong the moment it was not: a library with no groups is exactly the unorganised programme
   * `Kind` is most useful on, and the old rule withheld it from precisely those readers. That is
   * ADR-0082's clause about a surface every item of which would be shaded, arriving one option at a
   * time — the register's most-repeated shape, avoided here because it was looked for.
   */
  groupsAvailable?: boolean;
}): React.ReactElement {
  return (
    <div className="flex flex-col gap-1.5">
      <Label htmlFor={id}>Stack by</Label>
      <Select
        id={id}
        value={value}
        onChange={(event) => onChange(event.target.value as StackBy)}
        className="w-40"
      >
        <option value="resource">Resource</option>
        {/* **"Group", not "Trade group".** The resource library calls this kind a Group
            (`resource-schemas.ts:21`, and the table's own column header), and UX_STANDARDS' rule is
            that a concept is called the same thing everywhere. "Trade" is also wrong on the facts:
            a GROUP may hold EQUIPMENT or MATERIAL resources, so it mis-describes every grouping
            that is not labour.

            **Why, not just that it is shut.** The reason rides in the option's own label rather
            than in a `title` on the select: an option's text IS its accessible name, so it reaches
            a screen-reader user and a pointer user by the same channel, and a `title` on the select
            would now be describing one of three choices. A native `<option disabled>` is skipped by
            the platform's own keyboard model, which is ADR-0083's named exception for
            `<select>`. */}
        <option value="group" disabled={!groupsAvailable}>
          {groupsAvailable ? 'Group' : 'Group — none in the library yet'}
        </option>
        {/* Needs nothing of the reader: every resource has a kind, so this mode says something
            about a programme nobody has organised. Approved in the spec's US-8 and the plan's M3
            and not built until 2026-09-01 (`docs/TECH_DEBT.md` #228 item 4). */}
        <option value="kind">Kind</option>
      </Select>
    </div>
  );
}
