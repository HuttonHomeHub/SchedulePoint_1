// Minimal culled Canvas 2D TSLD renderer for the M0 prototype-at-scale spike
// (ADR-0026). Throwaway benchmark code — NOT app/feature code. It exercises the
// exact hot path the production renderer will have: a viewport transform, viewport
// culling, layered draw, a requestAnimationFrame loop with a dirty flag, and text
// drawn only when zoomed in enough (the ADR's dominant cost). It records per-frame
// draw time and frame intervals so the harness can report fps vs the ≥45/≥30 gate.

const LANE_HEIGHT = 26; // px per lane at 1× (matches the ADR's y = laneIndex × LANE_HEIGHT)
const BAR_H = 16;

// Label placement constants — mirror the production painter (render-model.ts) so the spike
// exercises the same inside/beside/none decision + truncation the shipped Layer 3.6 does.
const LABEL_MIN_PX_PER_DAY = 4;
const LABEL_INSIDE_MIN_PX = 24;
const LABEL_PAD_PX = 3;
const LABEL_GAP_PX = 4;
const LABEL_BESIDE_MIN_PX = 24;

/** Binary-search truncation with an ellipsis — a faithful copy of render-model.ts's truncateToWidth. */
function truncateToWidth(text, maxPx, measure, ellipsis = '…') {
  if (maxPx <= 0 || text.length === 0) return '';
  if (measure(text) <= maxPx) return text;
  if (measure(ellipsis) > maxPx) return '';
  let lo = 0;
  let hi = text.length;
  while (lo < hi) {
    const mid = Math.ceil((lo + hi) / 2);
    if (measure(text.slice(0, mid) + ellipsis) <= maxPx) lo = mid;
    else hi = mid - 1;
  }
  const kept = text.slice(0, lo).trimEnd();
  return kept ? kept + ellipsis : ellipsis;
}

/** Build a spatial bucket index by day so culling is O(visible), not O(count). */
function indexByDay(activities) {
  const byStartDay = new Map();
  for (const a of activities) {
    const bucket = byStartDay.get(a.startDay);
    if (bucket) bucket.push(a);
    else byStartDay.set(a.startDay, [a]);
  }
  return byStartDay;
}

export function createRenderer(canvas, scene) {
  const ctx = canvas.getContext('2d');
  const byDay = indexByDay(scene.activities);
  const activityById = new Map(scene.activities.map((a) => [a.id, a]));
  // Module-scoped (per-renderer) label-width cache — mirrors paint.ts's createMeasureCache: a
  // given string's width is measured via ctx.measureText at most once ever (font is fixed).
  const labelWidths = new Map();

  // Viewport: pxPerDay (zoom) + pan origin in screen px. World→screen is affine.
  const view = { pxPerDay: 8, panX: 40, panY: 40 };
  let dpr = 1;
  let cssW = 0;
  let cssH = 0;
  let dirty = true;

  // Perf capture (ring of recent frames): interval (fps) + draw-only time.
  const frames = [];
  let benchUntil = 0;

  function resize() {
    dpr = Math.min(globalThis.devicePixelRatio || 1, 2);
    const rect = canvas.getBoundingClientRect();
    cssW = rect.width;
    cssH = rect.height;
    canvas.width = Math.round(cssW * dpr);
    canvas.height = Math.round(cssH * dpr);
    dirty = true;
  }

  const worldX = (day) => day * view.pxPerDay + view.panX;
  const worldY = (lane) => lane * LANE_HEIGHT + view.panY;
  const dayAtX = (x) => (x - view.panX) / view.pxPerDay;

  function draw() {
    const t0 = performance.now();
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, cssW, cssH);

    // Cull to the visible day range (+ a small margin), then to visible lanes.
    const firstDay = Math.floor(dayAtX(0)) - 12;
    const lastDay = Math.ceil(dayAtX(cssW)) + 1;
    const firstLane = Math.max(0, Math.floor((0 - view.panY) / LANE_HEIGHT));
    const lastLane = Math.ceil((cssH - view.panY) / LANE_HEIGHT);

    // Layer 1: time-axis gridlines (weekly), cheap.
    ctx.strokeStyle = 'rgba(120,120,140,0.15)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    for (let d = firstDay - (firstDay % 7); d <= lastDay; d += 7) {
      const x = Math.round(worldX(d)) + 0.5;
      ctx.moveTo(x, 0);
      ctx.lineTo(x, cssH);
    }
    ctx.stroke();

    // Collect the visible activities once (used by both the arrow and bar layers).
    const visible = [];
    const visibleIds = new Set();
    for (let d = firstDay; d <= lastDay; d += 1) {
      const bucket = byDay.get(d);
      if (!bucket) continue;
      for (const a of bucket) {
        if (a.lane < firstLane || a.lane > lastLane) continue;
        visible.push(a);
        visibleIds.add(a.id);
      }
    }

    // Layer 2: dependency arrows (orthogonal L-route) — only when both ends are
    // visible or one end is (partial routing to the viewport edge is fine here).
    ctx.strokeStyle = 'rgba(90,90,110,0.5)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    for (const dep of scene.deps) {
      if (!visibleIds.has(dep.from) && !visibleIds.has(dep.to)) continue;
      const from = activityById.get(dep.from);
      const to = activityById.get(dep.to);
      const x1 = worldX(from.startDay + from.duration);
      const y1 = worldY(from.lane) + BAR_H / 2;
      const x2 = worldX(to.startDay);
      const y2 = worldY(to.lane) + BAR_H / 2;
      const midX = x1 + Math.min(12, view.pxPerDay);
      ctx.moveTo(x1, y1);
      ctx.lineTo(midX, y1);
      ctx.lineTo(midX, y2);
      ctx.lineTo(x2, y2);
    }
    ctx.stroke();

    // Layer 3: activity bars (colour by criticality — token-ish colours for the spike).
    for (const a of visible) {
      const x = worldX(a.startDay);
      const y = worldY(a.lane);
      const w = Math.max(2, a.duration * view.pxPerDay);
      ctx.fillStyle = a.isCritical
        ? 'rgba(200,60,60,0.9)'
        : a.isNearCritical
          ? 'rgba(210,150,40,0.9)'
          : 'rgba(70,110,190,0.9)';
      ctx.fillRect(x, y, w, BAR_H);
    }

    // Layer 3.6: activity labels — a faithful copy of the shipped painter's Layer 3.6 (paint.ts):
    // lane-bucket the visible set, x-sort each lane, compute the same-lane right-neighbour gap, pick
    // inside/beside/none, then memoised measureText + binary-search truncation. This is the load-
    // bearing text cost the ADR-0026 draw budget is judged on — measured here on realistic labels.
    if (view.pxPerDay >= LABEL_MIN_PX_PER_DAY) {
      ctx.font = '11px system-ui, sans-serif';
      ctx.textBaseline = 'middle';
      ctx.textAlign = 'left';
      const measure = (s) => {
        const hit = labelWidths.get(s);
        if (hit !== undefined) return hit;
        const m = ctx.measureText(s).width;
        labelWidths.set(s, m);
        return m;
      };
      const lanes = new Map();
      for (const a of visible) {
        const rect = { x: worldX(a.startDay), w: Math.max(2, a.duration * view.pxPerDay) };
        const row = lanes.get(a.lane);
        if (row) row.push({ a, rect });
        else lanes.set(a.lane, [{ a, rect }]);
      }
      for (const row of lanes.values()) {
        row.sort((p, q) => p.rect.x - q.rect.x);
        for (let i = 0; i < row.length; i += 1) {
          const { a, rect } = row[i];
          const nextLeftX = i + 1 < row.length ? row[i + 1].rect.x : Infinity;
          const besideRoomPx = nextLeftX - (rect.x + rect.w) - LABEL_GAP_PX;
          const cy = worldY(a.lane) + BAR_H / 2;
          if (rect.w >= LABEL_INSIDE_MIN_PX) {
            const text = truncateToWidth(a.label, rect.w - LABEL_PAD_PX * 2, measure);
            if (!text) continue;
            ctx.fillStyle = 'white';
            ctx.fillText(text, rect.x + LABEL_PAD_PX, cy);
          } else if (besideRoomPx >= LABEL_BESIDE_MIN_PX) {
            const startX = rect.x + rect.w + LABEL_GAP_PX;
            const maxPx = (nextLeftX === Infinity ? cssW : nextLeftX) - startX - LABEL_PAD_PX;
            const text = truncateToWidth(a.label, maxPx, measure);
            if (!text) continue;
            ctx.fillStyle = 'rgba(230,232,238,0.95)';
            ctx.fillText(text, startX, cy);
          }
        }
      }
    }

    const drawMs = performance.now() - t0;
    return drawMs;
  }

  let lastTs = performance.now();
  function frame(ts) {
    if (dirty || ts < benchUntil) {
      const drawMs = draw();
      const interval = ts - lastTs;
      frames.push({ ts, interval, drawMs, visible: undefined });
      if (frames.length > 600) frames.shift();
      dirty = false;
    }
    lastTs = ts;
    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);

  function markDirty() {
    dirty = true;
  }

  return {
    view,
    resize,
    markDirty,
    /** Pan by screen px. */
    pan(dx, dy) {
      view.panX += dx;
      view.panY += dy;
      dirty = true;
    },
    /** Zoom about a screen x anchor (cursor-anchored, per ADR). */
    zoomAt(screenX, factor) {
      const dayAtCursor = dayAtX(screenX);
      view.pxPerDay = Math.max(0.5, Math.min(60, view.pxPerDay * factor));
      view.panX = screenX - dayAtCursor * view.pxPerDay;
      dirty = true;
    },
    /**
     * Drive a scripted pan/zoom sweep for `durationMs`, forcing a redraw every
     * frame (worst case — continuous interaction), and return the captured fps +
     * draw-time stats. This is the gate measurement.
     */
    async bench(durationMs) {
      frames.length = 0;
      const start = performance.now();
      benchUntil = start + durationMs;
      // Script: pan left↔right and zoom in/out over the window.
      return new Promise((resolve) => {
        const step = (ts) => {
          const t = ts - start;
          // Continuous pan (sinusoidal) + periodic zoom pulses.
          this.pan(Math.sin(t / 120) * 6, Math.cos(t / 200) * 2);
          if (Math.floor(t / 400) % 2 === 0) this.zoomAt(cssW / 2, 1.01);
          else this.zoomAt(cssW / 2, 1 / 1.01);
          if (ts < benchUntil) requestAnimationFrame(step);
          else resolve(summarise(frames));
        };
        requestAnimationFrame(step);
      });
    },
  };
}

/** Median / p95 / min fps + median draw-ms from the captured frames. */
function summarise(frames) {
  const usable = frames.filter((f) => f.interval > 0 && f.interval < 1000);
  const intervals = usable.map((f) => f.interval).sort((a, b) => a - b);
  const draws = usable.map((f) => f.drawMs).sort((a, b) => a - b);
  const pct = (arr, p) => arr[Math.min(arr.length - 1, Math.floor(arr.length * p))] ?? 0;
  const medianInterval = pct(intervals, 0.5);
  const p95Interval = pct(intervals, 0.95);
  const worstInterval = intervals[intervals.length - 1] ?? 0;
  return {
    frames: usable.length,
    medianFps: medianInterval ? Math.round(1000 / medianInterval) : 0,
    p5Fps: p95Interval ? Math.round(1000 / p95Interval) : 0, // slowest 5% of frames
    minFps: worstInterval ? Math.round(1000 / worstInterval) : 0,
    medianDrawMs: Math.round(pct(draws, 0.5) * 100) / 100,
    p95DrawMs: Math.round(pct(draws, 0.95) * 100) / 100,
  };
}
