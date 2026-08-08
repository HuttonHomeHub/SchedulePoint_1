import { Minus, Plus } from 'lucide-react';

import type { TsldViewToggles } from '../render/paint';
import type { ZoomLevel } from '../render/render-model';
import { ZOOM_LEVELS } from '../render/time-scale';

import { Button } from '@/components/ui/button';
import { CANVAS_DATA_DATE_ENABLED } from '@/config/env';

const ZOOM_LABELS: Record<ZoomLevel, string> = {
  day: 'Day',
  week: 'Week',
  month: 'Month',
  quarter: 'Quarter',
  year: 'Year',
};

/** The view-layer toggles, in the order the checkbox group renders them. */
const TOGGLES: ReadonlyArray<{ key: keyof TsldViewToggles; label: string }> = [
  { key: 'dayGrid', label: 'Day grid' },
  { key: 'monthGrid', label: 'Month grid' },
  { key: 'yearGrid', label: 'Year grid' },
  // The data-date status line (canvas status & feedback M1) — offered here too so the legacy
  // (toolbar-off) surface and `View▾` agree about which layers exist. Flag-off it is absent, so
  // this list is byte-for-byte the pre-epic six (the parity claim in the spec's US-1).
  ...(CANVAS_DATA_DATE_ENABLED ? [{ key: 'dataDate', label: 'Data date line' } as const] : []),
  { key: 'today', label: 'Today' },
  { key: 'nonWorking', label: 'Non-working' },
  { key: 'labels', label: 'Labels' },
];

export interface TsldViewControlsProps {
  /** The active zoom preset (drives `aria-pressed`); derived from the live scale. */
  zoomPreset: ZoomLevel;
  onZoomPreset: (level: ZoomLevel) => void;
  onZoomStep: (factor: number) => void;
  onFit: () => void;
  toggles: TsldViewToggles;
  onToggle: (key: keyof TsldViewToggles) => void;
}

/**
 * The always-available **view controls** for the TSLD (read-only or editing): the zoom-preset
 * segmented control (Day…Year) with zoom −/+, Fit, and the five layer toggles (grid variants,
 * today, non-working). These change only what's *shown*, never the schedule, so they sit apart
 * from the editing toolbar. Every control is a real, labelled, keyboard-operable button/checkbox.
 */
export function TsldViewControls({
  zoomPreset,
  onZoomPreset,
  onZoomStep,
  onFit,
  toggles,
  onToggle,
}: TsldViewControlsProps): React.ReactElement {
  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
      {/*
       * `flex-wrap` here, not only on the row above (`docs/TECH_DEBT.md` #98). The outer row has
       * wrapped since it was written; this group did not, and at 420 px it cannot shrink — so at a
       * 320 px viewport `documentElement.scrollWidth` measured **436**, a WCAG 1.4.10 failure on the
       * guest share view, which is the product's only unauthenticated surface. CLAUDE.md §13 calls
       * AA a merge requirement, so this was a claim the project makes about itself being false in
       * production since 2026-07-21.
       *
       * Fixed on the **shared** control rather than branched by surface: the same component renders
       * in the member workspace, and a control that behaves differently depending on who is looking
       * at it is how the two drift. Re-checked at 320/360/768 on both surfaces.
       */}
      <div role="group" aria-label="Zoom" className="flex flex-wrap items-center gap-1">
        {ZOOM_LEVELS.map((level) => {
          const active = zoomPreset === level;
          return (
            <Button
              key={level}
              // Active preset uses `secondary` (near-black text on the light surface, ~16:1) rather
              // than the primary fill, whose L=0.50 blue vs. its foreground sits right on the 4.5:1
              // line and trips the WCAG contrast check for this 14px label (axe e2e). `font-semibold`
              // + `aria-pressed` carry the selected state; inactive presets stay ghost.
              variant={active ? 'secondary' : 'ghost'}
              size="sm"
              aria-pressed={active}
              className={active ? 'font-semibold' : undefined}
              onClick={() => onZoomPreset(level)}
            >
              {ZOOM_LABELS[level]}
            </Button>
          );
        })}
        <Button
          variant="outline"
          size="icon"
          aria-label="Zoom out"
          onClick={() => onZoomStep(1 / 1.3)}
        >
          <Minus aria-hidden="true" className="size-4" />
        </Button>
        <Button variant="outline" size="icon" aria-label="Zoom in" onClick={() => onZoomStep(1.3)}>
          <Plus aria-hidden="true" className="size-4" />
        </Button>
      </div>

      <Button variant="outline" size="sm" onClick={onFit}>
        Fit to plan
      </Button>

      <fieldset className="flex flex-wrap items-center gap-x-4 gap-y-1 border-0 p-0">
        <legend className="sr-only">Diagram layers</legend>
        {TOGGLES.map(({ key, label }) => (
          // `py-1` + `min-h-6` gives each label a ≥24px hit target (WCAG 2.2 SC 2.5.8, AA).
          <label key={key} className="flex min-h-6 items-center gap-1.5 py-1 text-sm">
            <input
              type="checkbox"
              className="accent-primary size-4"
              checked={toggles[key]}
              onChange={() => onToggle(key)}
            />
            {label}
          </label>
        ))}
      </fieldset>
    </div>
  );
}
