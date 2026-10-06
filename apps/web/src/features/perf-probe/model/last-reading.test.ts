import { describe, expect, it } from 'vitest';

import type { ProbeResultRow } from '../api/probe-results';

import { lastReadingSummary } from './last-reading';

const PHASE = { droppedPct: 0, intervalP50: 16.7, intervalP95: 17.2, fps: 59.9 };

const row = (over: Partial<ProbeResultRow> = {}): ProbeResultRow => ({
  id: 'r1',
  runId: 'run-1',
  sweepId: null,
  framesPerPhase: 180,
  recordedAt: '2026-09-08T18:00:00.000Z',
  recordedByLabel: 'owner',
  scenarioId: 'canvas-draw',
  scenarioVersion: 1,
  limbId: 'scale-2000',
  limbKind: 'absolute',
  preset: 'week',
  pxPerDay: 12,
  activityCount: 2000,
  edgeCount: 3200,
  sceneSummary: '2160 bars',
  samples: [PHASE, PHASE, PHASE],
  counts: { visibleBars: 243 },
  thresholds: { minFps: 30, minVisibleBars: 100, gated: true, source: 'ADR-0026 §9' },
  viewportWidth: 1912,
  viewportHeight: 1068,
  devicePixelRatio: 1,
  idleIntervalMs: 16.7,
  hardwareConcurrency: 8,
  deviceMemoryGb: 8,
  gpuRenderer: 'Intel Arc Pro',
  userAgent: 'test-agent',
  reducedMotion: false,
  lostFocusDuringRun: false,
  machineLabel: null,
  appVersion: '0.125.0',
  apiVersion: '0.61.0',
  ...over,
});

const NOW = new Date('2026-09-11T18:00:00.000Z');

describe('lastReadingSummary', () => {
  it('says nothing was measured when the history is empty', () => {
    expect(lastReadingSummary([], NOW)).toBe('Not measured on this installation yet.');
  });

  it('names how long ago, the machine and a tally of what the newest sitting holds', () => {
    const summary = lastReadingSummary([row({ machineLabel: 'the Dell' })], NOW);
    expect(summary).toMatch(/^Last measured 3 days ago on the Dell: \d+ \w+/);
    expect(summary.endsWith('.')).toBe(true);
  });

  it('describes the NEWEST sitting, not the first row it was handed', () => {
    const summary = lastReadingSummary(
      [
        row({ id: 'new', runId: 'n', recordedAt: '2026-09-11T17:00:00.000Z', machineLabel: 'new' }),
        row({ id: 'old', runId: 'o', recordedAt: '2026-09-01T17:00:00.000Z', machineLabel: 'old' }),
      ],
      NOW,
    );
    expect(summary).toContain('on new:');
    expect(summary).not.toContain('on old');
  });

  it('says the machine was not named rather than claiming it was this browser', () => {
    // The reading may have been taken by another staff member on another computer, and the history
    // cannot tell which; "this browser" would be a claim nobody checked.
    const summary = lastReadingSummary([row({ machineLabel: null })], NOW);
    expect(summary).toContain('on a machine that was not named');
    expect(summary).not.toContain('this browser');
  });
});
