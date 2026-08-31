import type { StackSegment } from '../model/stack-series';

/**
 * The legend both stacked surfaces show — one component, because **the strip shipped without one at
 * all**.
 *
 * The spec's D5 decided this in as many words: *"the strip canvas is `aria-hidden` … painting the
 * colour names into it would put the sole naming of the colours somewhere assistive technology
 * cannot reach … the chrome panel already exists … the legend joins them."* It never did. So a
 * planner turning on the resource strip saw up to four coloured bands with nothing on screen naming
 * any of them, and no way to learn that the top one was an aggregate — a decision made, written
 * down, and not built (ADR-0081), and a live WCAG 1.4.1 failure on that surface, since colour was
 * the only channel and no text anywhere mapped a colour to a name. Two independent reviews found it.
 *
 * Sharing the markup rather than writing a second legend is the same rule the derivation follows:
 * two legends would drift, and the drift would be invisible, because each looks right alone and
 * only somebody holding one surface against the other would ever see it.
 *
 * The swatch is `aria-hidden` decoration beside real text; the name is the accessible content. The
 * `row` layout exists because the strip's chrome is a compact horizontal band and a 168 px column
 * beside a 72 px strip would be taller than the thing it labels — it changes the wrapping, not what
 * is said.
 */
export function StackLegend({
  segments,
  layout = 'column',
  width,
  formatUnits,
}: {
  segments: readonly StackSegment[];
  /** `column` beside a tall plot (the dialog); `row` above a thin band (the canvas strip). */
  layout?: 'column' | 'row';
  /** Fixed width for the `column` layout, so the plot's left edge does not move between plans. */
  width?: number;
  /** Render a segment's total beside its name. Omitted where there is no room for it. */
  formatUnits?: (units: number) => string;
}): React.ReactElement {
  const row = layout === 'row';
  return (
    <ul
      aria-label="Legend"
      className={
        row
          ? 'flex flex-wrap items-baseline gap-x-4 gap-y-1 text-sm'
          : 'flex shrink-0 flex-col gap-1 text-sm'
      }
      {...(width !== undefined && !row ? { style: { width: `${String(width)}px` } } : {})}
    >
      {segments.map((seg) => (
        <li
          key={seg.resourceId ?? '__other'}
          className={row ? 'flex items-baseline gap-2' : 'flex items-baseline gap-2'}
        >
          <span
            aria-hidden="true"
            className="mt-1 inline-block size-3 shrink-0 rounded-xs"
            style={{ background: seg.fill }}
          />
          <span className={row ? 'truncate' : 'min-w-0 flex-1 truncate'} title={seg.label}>
            {seg.label}
          </span>
          {formatUnits ? (
            <span className="text-muted-foreground shrink-0 tabular-nums">
              {formatUnits(seg.total)}
            </span>
          ) : null}
        </li>
      ))}
    </ul>
  );
}
