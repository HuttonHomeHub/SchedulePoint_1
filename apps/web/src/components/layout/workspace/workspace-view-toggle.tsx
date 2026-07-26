import { SegmentedControl } from '@/components/ui/segmented-control';

/** The single pane a narrow (below-`md`) workspace shows: the canvas diagram or the activities table. */
export type WorkspacePane = 'diagram' | 'activities';

const OPTIONS: { value: WorkspacePane; label: string }[] = [
  { value: 'diagram', label: 'Diagram' },
  { value: 'activities', label: 'Activities' },
];

/**
 * The mobile (below `md`) view switch shared by both plan-workspace layouts (ADR-0030 & ADR-0031):
 * a **`radiogroup`** choosing whether the single pane shows the **Diagram** (canvas) or the
 * **Activities** table — mutually-exclusive single-select, so radios (roving `tabindex`,
 * Arrow/Home/End) convey "one of a set" to AT better than toggle buttons. Rendered only below `md`,
 * where the vertical split can't give both surfaces useful height. Because the toggle *is* the
 * control the user acts on, focus stays on it across a switch (never stranded in the hidden pane).
 *
 * The pattern itself now lives in {@link SegmentedControl}; what stays here is this instance's
 * copy, its `min-h-11` touch target, and the bar chrome it sits in.
 */
export function WorkspaceViewToggle({
  value,
  onChange,
}: {
  value: WorkspacePane;
  onChange: (value: WorkspacePane) => void;
}): React.ReactElement {
  return (
    <SegmentedControl
      label="Workspace view"
      value={value}
      onChange={onChange}
      options={OPTIONS}
      className="border-border shrink-0 border-b p-2"
      optionClassName="min-h-11 flex-1"
    />
  );
}
