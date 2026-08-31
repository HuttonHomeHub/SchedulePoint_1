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
  disabled = false,
}: {
  id: string;
  value: StackBy;
  onChange: (next: StackBy) => void;
  disabled?: boolean;
}): React.ReactElement {
  return (
    <div className="flex flex-col gap-1.5">
      <Label htmlFor={id}>Stack by</Label>
      <Select
        id={id}
        value={value}
        onChange={(event) => onChange(event.target.value as StackBy)}
        disabled={disabled}
        // **Why, not just that it is shut.** `disabled` here means the organisation's resource
        // library has no group in it, which is a state the reader can change and cannot guess. A
        // native `<select>` keeps `disabled` under ADR-0083's named exception, so a `title` is the
        // channel this codebase already uses for the reason (`tsld-toolbar-items.tsx`,
        // `selection-actions.tsx`).
        {...(disabled
          ? { title: 'No resource groups yet — give a resource a parent group to stack by it.' }
          : {})}
        className="w-40"
      >
        <option value="resource">Resource</option>
        {/* **"Group", not "Trade group".** The resource library calls this kind a Group
            (`resource-schemas.ts:21`, and the table's own column header), and UX_STANDARDS' rule is
            that a concept is called the same thing everywhere. "Trade" is also wrong on the facts:
            a GROUP may hold EQUIPMENT or MATERIAL resources, so it mis-describes every grouping
            that is not labour. */}
        <option value="group">Group</option>
      </Select>
    </div>
  );
}
