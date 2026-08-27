import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

import { HEALTH_METRIC_IDS } from '@repo/types';
import { describe, expect, it } from 'vitest';

import { CONFLICT_FLAGS } from '@/features/tsld/render/conflicts';

/**
 * **G1–G3 (spec §4.3): the health and conflict vocabularies stay apart, and every number on the
 * panel came from the payload.**
 *
 * A health finding is structural (how the plan is built); a conflict is engine-owned (what this
 * recalculation hit). ADR-0094 deliberately REMOVED negative float from the conflict set — right
 * for a navigation cycle, wrong for an assessment — so the same fact legitimately lives in one
 * vocabulary and not the other. That is exactly the setup that produces two disagreeing numbers if
 * nothing pins the boundary; these gates pin it.
 *
 * **Verified red first** (ADR-0110 D5): G2 by importing `orderedConflicts` into `health-rows.ts`
 * (failed naming the file), G3 by adding `const CPLI_FLOOR = 0.95` to the model (failed naming the
 * line). Both injections removed.
 */

const FEATURE_DIR = join(__dirname);

function sourceFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((entry) => {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) return sourceFiles(full);
    return full.endsWith('.ts') || full.endsWith('.tsx') ? [full] : [];
  });
}

describe('G1 — disjoint vocabularies', () => {
  it('no health metric id is a conflict key', () => {
    const conflictKeys = new Set<string>(CONFLICT_FLAGS.map((f) => f.key));
    const overlap = HEALTH_METRIC_IDS.filter((id) => conflictKeys.has(id));
    expect(overlap).toEqual([]);
    // The positive halves: both vocabularies are non-empty, so the intersection test cannot pass
    // by one side being nothing.
    expect(HEALTH_METRIC_IDS.length).toBe(14);
    expect(conflictKeys.size).toBeGreaterThan(0);
  });
});

describe('G2 — no import in either direction', () => {
  const files = sourceFiles(FEATURE_DIR).filter((f) => !f.includes('.structural.test.'));

  it('scanned a non-zero number of feature sources', () => {
    expect(files.length).toBeGreaterThan(0);
  });

  it.each(files.map((f) => [f.split('/schedule-health/')[1] ?? f, f]))(
    '%s does not import the conflict vocabulary',
    (_, file) => {
      const text = readFileSync(file, 'utf8');
      expect(text).not.toMatch(/from '[^']*render\/conflicts'/);
    },
  );

  it('the conflict module does not import this feature', () => {
    const conflicts = readFileSync(
      join(FEATURE_DIR, '..', 'tsld', 'render', 'conflicts.ts'),
      'utf8',
    );
    expect(conflicts).not.toMatch(/schedule-health/);
  });
});

describe('G3 — one source per number', () => {
  const files = sourceFiles(FEATURE_DIR).filter((f) => !f.includes('.structural.test.'));
  // The DCMA judging numbers, none of which may be authored client-side: the percent bars (5, 90),
  // the day bars (44) and the index floor (0.95). `5` alone would false-positive on every Tailwind
  // size class, so the percent bars are matched only beside a comparison or a `value` key — the
  // shapes a smuggled threshold takes.
  const BANNED = [
    /\b0\.95\b/,
    /\b44\b/,
    /(?:value|threshold)\s*[:=]\s*(?:5|90)\b/,
    /[<>]=?\s*(?:5|90)\b/,
  ];

  // Comments are STRIPPED before scanning — documenting a threshold must not count as stating
  // one. This is the fourth scan-matching-prose gate in this repository (ADR-0106 M4 records the
  // third), and its siblings fixed themselves exactly this way.
  const stripComments = (text: string): string =>
    text.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');

  it.each(files.map((f) => [f.split('/schedule-health/')[1] ?? f, f]))(
    '%s states no threshold of its own',
    (_, file) => {
      const text = stripComments(readFileSync(file, 'utf8'));
      for (const pattern of BANNED) {
        const match = pattern.exec(text);
        expect(match, `banned threshold-shaped literal ${String(pattern)}`).toBeNull();
      }
    },
  );

  it('the positive case: the panel really does render a threshold (from a payload value)', () => {
    // The ban above cannot mean "there were no thresholds to check" (the ADR-0093/ADR-0108
    // lesson): the formatter must produce a threshold label when handed one.
    // Imported dynamically so the file-scan half stays a pure fs test.
    return import('./model/health-rows').then(({ buildHealthRows }) => {
      const rows = buildHealthRows({
        planId: 'p',
        planName: 'P',
        dataDate: '2026-01-01',
        computedAt: null,
        schedulingMode: 'EARLY',
        activityCount: 1,
        relationshipCount: 0,
        baseline: null,
        summary: { passed: 0, failed: 1, notAssessable: 13, informational: 0 },
        offenderCap: 50,
        metrics: [
          {
            id: 'MISSING_LOGIC',
            ordinal: 1,
            name: 'Missing logic',
            verdict: 'FAIL',
            reason: null,
            measured: { count: 1, denominator: 10, percent: 10, ratio: null },
            threshold: { kind: 'MAX_PERCENT', value: 7 },
            detail: null,
            offenderCount: 1,
            offendersTruncated: false,
            offenders: [],
          },
        ],
      });
      // The label carries the PAYLOAD's 7 — a number this feature's sources nowhere contain.
      expect(rows[0]!.thresholdLabel).toBe('≤ 7 %');
      expect(rows[0]!.measuredLabel).toBe('1 of 10 (10 %)');
    });
  });
});
