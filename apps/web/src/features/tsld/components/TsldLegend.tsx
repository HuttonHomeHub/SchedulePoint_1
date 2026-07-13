/**
 * The visible key for the diagram, mirroring the canvas exactly: each activity class is a
 * fill colour **paired with an outline style** (solid / dashed / none) so criticality is
 * never conveyed by colour alone (WCAG 1.4.1). Swatches read their colours from the same
 * design tokens the painter uses, so the key stays truthful across themes.
 *
 * Shared so the self-contained {@link TsldPanel} chrome and the canvas-first `Legend▾` toolbar
 * popover (ADR-0031) render one definition — the key can't drift from the canvas or itself.
 */
type LegendItem =
  | { label: string; swatch: React.CSSProperties }
  | { label: string; line: 'solid' | 'dashed' }
  | { label: string; pin: true }
  | { label: string; today: true };

const LEGEND: ReadonlyArray<LegendItem> = [
  {
    label: 'Critical',
    swatch: {
      backgroundColor: 'var(--color-destructive)',
      border: '1.5px solid var(--color-foreground)',
    },
  },
  {
    label: 'Near-critical',
    swatch: {
      backgroundColor: 'var(--color-warning)',
      border: '1.5px dashed var(--color-foreground)',
    },
  },
  { label: 'On schedule', swatch: { backgroundColor: 'var(--color-primary)' } },
  // A set date constraint marks its pinned edge with a small pin, matching the canvas (a
  // shape cue, not colour — WCAG 1.4.1).
  { label: 'Constraint', pin: true },
  // Non-working (weekend/holiday) columns are washed in the muted tone; today is a dashed
  // vertical in the destructive tone. Both toggleable in the view controls.
  {
    label: 'Non-working',
    swatch: { backgroundColor: 'var(--color-muted)', border: '1px solid var(--color-border)' },
  },
  { label: 'Today', today: true },
  // Logic ties, matching the canvas: a driving link (heavier solid) sets its
  // successor's start; a non-driving link (thin dashed) carries slack (M3).
  { label: 'Driving link', line: 'solid' },
  { label: 'Non-driving link', line: 'dashed' },
];

/** The diagram legend as a labelled list — used inline by {@link TsldPanel} and inside the
 * canvas-first `Legend▾` popover (ADR-0031). Pure presentation; no state. */
export function TsldLegend(): React.ReactElement {
  return (
    <ul
      aria-label="Legend"
      className="text-muted-foreground flex flex-wrap items-center gap-x-4 gap-y-1 text-xs"
    >
      {LEGEND.map((item) => (
        <li key={item.label} className="flex items-center gap-1.5">
          {'pin' in item ? (
            <span aria-hidden="true" className="inline-flex h-3 w-5 items-center justify-center">
              <span
                style={{
                  width: 0,
                  height: 0,
                  borderLeft: '4px solid transparent',
                  borderRight: '4px solid transparent',
                  borderTop: '5px solid var(--color-muted-foreground)',
                }}
              />
            </span>
          ) : 'today' in item ? (
            <span aria-hidden="true" className="inline-flex h-3 w-5 justify-center">
              <span
                className="h-full"
                style={{
                  borderLeftWidth: 1.5,
                  borderLeftStyle: 'dashed',
                  borderLeftColor: 'var(--color-destructive)',
                }}
              />
            </span>
          ) : 'line' in item ? (
            <span aria-hidden="true" className="inline-flex h-3 w-5 items-center">
              <span
                className="w-full"
                style={{
                  borderTopWidth: item.line === 'solid' ? 2 : 1.5,
                  borderTopStyle: item.line,
                  borderTopColor: 'var(--color-muted-foreground)',
                }}
              />
            </span>
          ) : (
            <span
              aria-hidden="true"
              className="inline-block h-3 w-5 rounded-sm"
              style={item.swatch}
            />
          )}
          {item.label}
        </li>
      ))}
    </ul>
  );
}
