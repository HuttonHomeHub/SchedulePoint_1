import { AlignVerticalSpaceAround, MousePointer2, SquarePlus } from 'lucide-react';

import type { EditMode } from '../interaction/gesture-machine';

import { Button } from '@/components/ui/button';

export interface TsldToolbarProps {
  mode: EditMode;
  onModeChange: (mode: EditMode) => void;
  /** Open the auto-arrange confirm dialog (M4 4.3). Absent → the action isn't offered. */
  onAutoArrange?: () => void;
  /** Focus target for returning focus after the create popover closes. */
  addActivityRef?: React.Ref<HTMLButtonElement>;
}

/**
 * The editing toolbar for the TSLD (M2, shown only when editing is enabled — §4 of the M2
 * design). A two-button segmented control chooses the tool: **Select** (M1 pan/select +
 * hit-zone reposition/link) or **Add activity** (drag to draw). Each button carries
 * `aria-pressed` so the current tool is announced. View controls (zoom, Fit, layer toggles)
 * live in the always-available {@link TsldViewControls}, not here.
 */
export function TsldToolbar({
  mode,
  onModeChange,
  onAutoArrange,
  addActivityRef,
}: TsldToolbarProps): React.ReactElement {
  return (
    <div className="flex items-center gap-2">
      <div role="group" aria-label="Diagram tool" className="flex items-center gap-1">
        <Button
          variant={mode === 'select' ? 'default' : 'outline'}
          size="sm"
          aria-pressed={mode === 'select'}
          onClick={() => onModeChange('select')}
        >
          <MousePointer2 aria-hidden="true" className="size-4" />
          Select
        </Button>
        <Button
          ref={addActivityRef}
          variant={mode === 'add-activity' ? 'default' : 'outline'}
          size="sm"
          aria-pressed={mode === 'add-activity'}
          onClick={() => onModeChange('add-activity')}
        >
          <SquarePlus aria-hidden="true" className="size-4" />
          Add activity
        </Button>
      </div>
      {onAutoArrange ? (
        <Button variant="outline" size="sm" onClick={onAutoArrange}>
          <AlignVerticalSpaceAround aria-hidden="true" className="size-4" />
          Auto-arrange lanes
        </Button>
      ) : null}
    </div>
  );
}
