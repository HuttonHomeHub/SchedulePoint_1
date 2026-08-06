/**
 * A schematic time-scaled logic diagram, drawn in tokens (ADR-0077 §4).
 *
 * **The product's own picture, not decoration bought in.** A stranger arriving at `/sign-in` sees
 * a card and a form; nothing on the screen says what SchedulePoint is. The motif answers that with
 * the one thing no competitor's login screen shows: bars placed on a time axis and joined by logic.
 *
 * **Why it is inline SVG and not an image.** ADR-0074's Content-Security-Policy is
 * `img-src 'self' blob:` with **no `data:`** (`docker-compose.yml:81`), so both an asset file and
 * the fashionable zero-request `data:image/svg+xml` are fetches this origin either pays for or
 * refuses. Inline markup is neither: it is part of the document, costs no request, and cannot be
 * blocked. It also stays in the design system's reach — every stroke and fill is a compiled
 * utility, so the ADR-0055 contrast matrix can see it and the colour-literal lint rule (widened to
 * `src/components/**` long ago) covers it.
 *
 * **It draws from the enclosing surface's own semantic names, never from `--chart-*`.** Chart
 * tokens are page-level and are **not** in `REBOUND_NAMES`, so on a fixed navy panel Corporate's
 * `--chart-2` keeps its page value and lands around 1.4:1 — the motif would simply disappear for
 * those users, silently, exactly the class of defect ADR-0055 was written to record.
 *
 * **A motif, not a chart.** Six bars is the cap. It says "this is a schedule tool"; it is not
 * trying to be a schedule.
 */

/** One bar: a lane row, a start day and a span, in the motif's own 0–100 × 0–60 grid. */
const BARS = [
  { lane: 0, x: 6, width: 26 },
  { lane: 1, x: 30, width: 20 },
  { lane: 2, x: 48, width: 30 },
  { lane: 3, x: 62, width: 18 },
  { lane: 1, x: 76, width: 18 },
] as const;

/** Finish-to-start links, by index into {@link BARS}. */
const LINKS = [
  [0, 1],
  [1, 2],
  [2, 4],
] as const;

const LANE_HEIGHT = 12;
const BAR_HEIGHT = 6;
const TOP = 8;

function barY(lane: number): number {
  return TOP + lane * LANE_HEIGHT;
}

export function TsldMotif({ className }: { className?: string }): React.ReactElement {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 100 60"
      preserveAspectRatio="xMidYMid meet"
      className={className}
      role="presentation"
    >
      {/* Day gridlines — the "time-scaled" half of the name. `--border` inside the brand scope. */}
      {[0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map((tick) => (
        <line
          key={tick}
          x1={tick * 10}
          y1={2}
          x2={tick * 10}
          y2={58}
          className="stroke-border"
          strokeWidth={0.4}
        />
      ))}

      {/* Logic, drawn under the bars so a bar always wins an overlap — the same painter order the
          real canvas uses (ADR-0065). Orthogonal, because a diagonal on a time-scaled diagram
          asserts work across the days it crosses. */}
      {LINKS.map(([from, to]) => {
        const a = BARS[from];
        const b = BARS[to];
        const ax = a.x + a.width;
        const ay = barY(a.lane) + BAR_HEIGHT / 2;
        const by = barY(b.lane) + BAR_HEIGHT / 2;
        const midX = (ax + b.x) / 2;
        return (
          <g key={`${String(from)}-${String(to)}`} className="stroke-muted-foreground">
            <path
              d={`M ${String(ax)} ${String(ay)} H ${String(midX)} V ${String(by)} H ${String(b.x)}`}
              fill="none"
              strokeWidth={0.7}
            />
            <path
              d={`M ${String(b.x - 2)} ${String(by - 1.4)} L ${String(b.x)} ${String(by)} L ${String(b.x - 2)} ${String(by + 1.4)}`}
              fill="none"
              strokeWidth={0.7}
            />
          </g>
        );
      })}

      {/* The bars. The critical one takes `--primary`, which inside the brand scope is the amber
          that clears 3:1 on navy nearly three times over; the rest take `--accent`. */}
      {BARS.map((bar, index) => (
        <rect
          key={`${String(bar.lane)}-${String(bar.x)}`}
          x={bar.x}
          y={barY(bar.lane)}
          width={bar.width}
          height={BAR_HEIGHT}
          rx={1.5}
          className={index === 2 ? 'fill-primary' : 'fill-accent'}
        />
      ))}
    </svg>
  );
}
