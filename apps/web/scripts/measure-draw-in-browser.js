/**
 * Draw-performance measurement for a **running** SchedulePoint instance (TECH_DEBT #75).
 *
 * This file is not executed by any tooling in this repo. It is **pasted into the browser's
 * DevTools console** on a plan workspace, against whatever deployment the operator already runs.
 * That is the whole point: `measure:draw` needs a checkout, an install and a Playwright browser,
 * which is a lot to ask of the one person who has the hardware ADR-0026 §16 names — and asking
 * produced months of the budget going unmeasured.
 *
 * **What it measures, and how it differs from `measure:draw`.** The script harness times
 * `paintScene` in isolation against a synthetic scene. This times **the app**: it wraps
 * `window.requestAnimationFrame` and records how long each callback runs and how far apart the
 * frames land. `TsldCanvas`'s loop re-enters `requestAnimationFrame` by bare identifier every
 * frame, so the wrapper is picked up on the next frame and needs no cooperation from the app.
 *
 * That is a *better* answer to #75's first question — "decide what to measure" — because frame
 * pacing under rAF is what a planner experiences, and one function's wall-clock is not. It is a
 * *worse* answer to "is the painter fast", because a frame's cost here includes the ruler sync,
 * the interaction layer and any other rAF work. Both numbers are reported so neither is implied
 * by the other: `frame JS` is the whole frame, `heaviest callback` is the canvas loop alone.
 *
 * The idle baseline is not decoration. `TsldCanvas` gates its paint on `dirtyRef`, so an idle
 * frame does almost nothing — which makes the idle phase a clean read of the **display's** refresh
 * interval. Without it there is nothing to call a dropped frame against, and a 120 Hz laptop and a
 * 60 Hz one would be scored on the same 16.7 ms.
 */

/* global window, document */

(() => {
  const IDLE_MS = 2000;
  const PAN_MS = 10_000;

  // The scene canvas carries no test id, and it is not the first `<canvas>` in the DOM — the WBS
  // band and the resource strip are painted into earlier siblings. Both of those DO carry a test
  // id, and both are short bands, so the scene is "the biggest canvas that isn't a named band".
  // Selecting `canvas` and taking the first would have reported the band's height as the viewport.
  const canvas = [...document.querySelectorAll('canvas:not([data-testid])')].sort(
    (a, b) =>
      b.getBoundingClientRect().height * b.getBoundingClientRect().width -
      a.getBoundingClientRect().height * a.getBoundingClientRect().width,
  )[0];
  const listbox = document.querySelector('ul[aria-label="Activities in the diagram"]');
  if (!canvas) {
    console.error(
      'No canvas found. Open a plan on the Diagram (TSLD) view before running this, and make sure the diagram pane is visible.',
    );
    return;
  }

  /**
   * Refuse an empty or near-empty plan **before** spending the operator's twelve seconds.
   *
   * The first real run of this script reported 0.5 ms p95 — comfortably inside ADR-0026 §16's
   * 4 ms — on a plan with **zero** activities. That is not the budget being met, it is an empty
   * canvas, and it read as a pass. It is the same failure the runbook already records against the
   * scripted harness, whose generated plan once spanned 28 years so "whole plan" zoom culled nine
   * bars in ten and reported a very pretty 4.6 ms.
   *
   * A measurement that cannot distinguish "fast" from "nothing was drawn" is worse than none,
   * because it retires the question. So this is a hard stop, not a warning.
   */
  const activityCount = listbox ? listbox.children.length : null;
  if (activityCount === null) {
    console.error(
      'No activity listbox found — this does not look like the Diagram (TSLD) view. Switch to it and re-run.',
    );
    return;
  }
  if (activityCount === 0) {
    console.error(
      'This plan has NO activities, so the canvas has nothing to draw and any figure would measure an empty screen. Open a plan with real activities in it — ideally your largest — and re-run.',
    );
    return;
  }
  if (activityCount < 200) {
    console.warn(
      `Only ${activityCount} activities. The run will work, but ADR-0026 §16's budget is stated at 2,000 — a small plan cannot confirm or refute it. Use your largest plan if you have a bigger one.`,
    );
  }

  const originalRaf = window.requestAnimationFrame.bind(window);
  /** @type {Map<number, { total: number, max: number }>} */
  const byFrame = new Map();
  /** @type {number[]} */
  const longTasks = [];
  let collecting = false;

  window.requestAnimationFrame = function measured(callback) {
    return originalRaf((timestamp) => {
      if (!collecting) return callback(timestamp);
      const started = performance.now();
      try {
        return callback(timestamp);
      } finally {
        const elapsed = performance.now() - started;
        const frame = byFrame.get(timestamp);
        if (frame) {
          frame.total += elapsed;
          if (elapsed > frame.max) frame.max = elapsed;
        } else {
          byFrame.set(timestamp, { total: elapsed, max: elapsed });
        }
      }
    });
  };

  let observer = null;
  try {
    observer = new PerformanceObserver((list) => {
      if (!collecting) return;
      for (const entry of list.getEntries()) longTasks.push(entry.duration);
    });
    observer.observe({ entryTypes: ['longtask'] });
  } catch {
    // Long-task timing is Chromium-only. Its absence is reported, never silently treated as zero.
    observer = null;
  }

  const percentile = (sorted, p) =>
    sorted.length === 0 ? NaN : sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * p))];

  /** Close the collected frames into intervals and per-frame costs, then reset the buffer. */
  function drain() {
    const stamps = [...byFrame.keys()].sort((a, b) => a - b);
    const intervals = [];
    for (let i = 1; i < stamps.length; i += 1) intervals.push(stamps[i] - stamps[i - 1]);
    const totals = stamps.map((t) => byFrame.get(t).total);
    const maxima = stamps.map((t) => byFrame.get(t).max);
    byFrame.clear();
    return {
      frames: stamps.length,
      intervals: intervals.sort((a, b) => a - b),
      totals: totals.sort((a, b) => a - b),
      maxima: maxima.sort((a, b) => a - b),
    };
  }

  /**
   * Pixels-per-day read off the ruler, so the zoom is a measured fact rather than a remembered one.
   * Day ticks are absolutely-positioned spans; when two adjacent ones are consecutive dates their
   * x-gap IS `pxPerDay`. At coarse zoom the stride is wider than a day and the gap means nothing —
   * so this returns null rather than a plausible wrong number, and the report says which zoom
   * preset was used instead.
   */
  function readPxPerDay() {
    const ruler = document.querySelector('[data-testid="tsld-ruler"]');
    const dayRow = ruler?.lastElementChild;
    if (!dayRow) return null;
    const ticks = [...dayRow.children]
      .filter((n) => n.style.display !== 'none')
      .map((n) => ({
        x: Number.parseFloat(/translateX\((-?[\d.]+)px\)/.exec(n.style.transform)?.[1] ?? 'NaN'),
        label: Number.parseInt(n.textContent ?? '', 10),
      }))
      .filter((t) => Number.isFinite(t.x) && Number.isFinite(t.label));
    for (let i = 1; i < ticks.length; i += 1) {
      if (ticks[i].label - ticks[i - 1].label === 1) return ticks[i].x - ticks[i - 1].x;
    }
    return null;
  }

  /**
   * Which GPU the browser is actually on. A mobile workstation typically has two — an integrated
   * one and a discrete one — and Windows decides per-process which a browser gets. Canvas 2D
   * rasterisation differs enough between them that a number without this line is not interpretable
   * on such a machine: two honest runs can differ by more than the feature being measured.
   *
   * Read through a throwaway WebGL context, which is the only route JS has. Browsers increasingly
   * mask it for fingerprinting reasons, so an unavailable answer is reported as unavailable and
   * `chrome://gpu` named as the fallback — never guessed.
   */
  function readGpu() {
    try {
      const gl = document.createElement('canvas').getContext('webgl');
      const info = gl?.getExtension('WEBGL_debug_renderer_info');
      if (!gl || !info) return 'masked by the browser — check chrome://gpu';
      return String(gl.getParameter(info.UNMASKED_RENDERER_WEBGL));
    } catch {
      return 'masked by the browser — check chrome://gpu';
    }
  }

  const fmt = (n) => (Number.isFinite(n) ? n.toFixed(1) : '—');

  console.log(
    `%cPhase 1/2 — idle baseline (${IDLE_MS / 1000}s). Do not touch anything.`,
    'font-weight:bold',
  );
  collecting = true;

  setTimeout(() => {
    const idle = drain();
    const period = percentile(idle.intervals, 0.5);
    const hz = Number.isFinite(period) ? Math.round(1000 / period) : NaN;

    console.log(
      `%cPhase 2/2 — pan for ${PAN_MS / 1000}s. Drag the diagram left and right without stopping.`,
      'font-weight:bold;color:#0a0',
    );

    setTimeout(() => {
      collecting = false;
      window.requestAnimationFrame = originalRaf;
      observer?.disconnect();
      const pan = drain();

      const budget = Number.isFinite(period) ? period : 16.7;
      const dropped = pan.intervals.filter((i) => i > budget * 1.5).length;
      const pxPerDay = readPxPerDay();

      const report = [
        '=== SchedulePoint draw measurement (TECH_DEBT #75) ===',
        `when            ${new Date().toISOString()}`,
        `activities      ${activityCount}`,
        `canvas          ${Math.round(canvas.getBoundingClientRect().width)}x${Math.round(canvas.getBoundingClientRect().height)} CSS px @ DPR ${window.devicePixelRatio}`,
        `gpu             ${readGpu()}`,
        `zoom            ${pxPerDay === null ? 'coarser than 1 tick/day — state the preset you used' : `${fmt(pxPerDay)} px/day`}`,
        `display         ${fmt(period)} ms/frame idle (~${Number.isFinite(hz) ? hz : '?'} Hz)`,
        `cores / memory  ${navigator.hardwareConcurrency ?? '?'} / ${navigator.deviceMemory ?? '?'} GB`,
        `browser         ${navigator.userAgent}`,
        '',
        `IDLE   ${idle.frames} frames | JS/frame p50 ${fmt(percentile(idle.totals, 0.5))} ms  p95 ${fmt(percentile(idle.totals, 0.95))} ms`,
        `PAN    ${pan.frames} frames`,
        `  frame interval   p50 ${fmt(percentile(pan.intervals, 0.5))}  p95 ${fmt(percentile(pan.intervals, 0.95))}  p99 ${fmt(percentile(pan.intervals, 0.99))} ms`,
        `  frame JS (all)   p50 ${fmt(percentile(pan.totals, 0.5))}  p95 ${fmt(percentile(pan.totals, 0.95))} ms`,
        `  heaviest cb      p50 ${fmt(percentile(pan.maxima, 0.5))}  p95 ${fmt(percentile(pan.maxima, 0.95))} ms   <- the canvas loop`,
        `  dropped frames   ${dropped} / ${pan.intervals.length} (${((dropped / Math.max(1, pan.intervals.length)) * 100).toFixed(1)}%, >1.5x the idle period)`,
        `  long tasks >50ms ${observer === null ? 'not available in this browser' : `${longTasks.length}${longTasks.length ? ` (worst ${fmt(Math.max(...longTasks))} ms)` : ''}`}`,
        '',
        'Paste this WITH the machine it came from: model, year, RAM, and mains or battery.',
        'A number without its machine is not a measurement.',
      ].join('\n');

      console.log(report);
      window.__schedulepointDrawReport = report;
      console.log(
        '%cReport also at window.__schedulepointDrawReport — run copy(window.__schedulepointDrawReport) to put it on the clipboard.',
        'color:#888',
      );
    }, PAN_MS);
  }, IDLE_MS);
})();
