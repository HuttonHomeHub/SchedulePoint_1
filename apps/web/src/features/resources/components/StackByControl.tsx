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
        className="w-40"
      >
        <option value="resource">Resource</option>
        <option value="group">Trade group</option>
      </Select>
    </div>
  );
}
