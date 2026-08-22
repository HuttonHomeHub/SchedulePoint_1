import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

const SRC = join(__dirname, '..', '..', '..');

/**
 * **The exported diagram is composed from the same vocabulary as the screen** — and every key it
 * leaves out is a decision somebody made, named here with a reason.
 *
 * `docs/TECH_DEBT.md` #164 recorded the export dropping two default-on layers. It was **seven**,
 * and the count was only reachable by enumerating both compositions: `TsldCanvas` builds 25 scene
 * keys and the export built six. The difference was not a design decision anybody had taken — it
 * was nine features each adding correctly to the screen and nobody re-reading the export.
 *
 * **This gate is DERIVED, not a list, and that distinction is the whole point.** The plan specified
 * it as "fails on a literal `monthBands:` / `gridTiers:` / … outside the composer" — a hard-coded
 * six-name roster beside a vocabulary that grows, which is the ADR-0073 C4 defect the same plan
 * cites approvingly elsewhere. A seventh key would have been in neither list and failed nothing;
 * `todayFraction` already was that seventh key, present on the screen since 2026-07-27 and absent
 * from the artefact, unreported. So the rosters are parsed from the two files and compared, and a
 * key added to the canvas tomorrow fails here until somebody classifies it.
 *
 * Carries ADR-0093's **second** assertion too — that the export roster is non-empty. Without it a
 * refactor that emptied the export scene would satisfy the difference check and pass, which is the
 * green-for-having-tested-nothing shape.
 */

const CANVAS = join(SRC, 'features/tsld/components/TsldCanvas.tsx');
const EXPORT = join(SRC, 'features/tsld/toolbar/commands/use-diagram-image.ts');

/**
 * The keys the export deliberately does not compose, each with the reason. **A reason per entry,
 * not a bare list** — the previous state of this boundary was a bare absence, and an absence a
 * reader cannot distinguish from an oversight is what let seven layers go missing.
 */
const SCREEN_ONLY: Record<string, string> = {
  selectedId: 'a selection is a live interaction; a delivered picture has no selected bar',
  selectedIds: 'as selectedId — the plural selection (ADR-0080) is interaction state',
  showEdgeHandles: 'edge handles are grab targets, and paper has no pointer',
  dimmedIds: 'the search/filter lens dims what does not match; an export is not a search result',
  hoverId: 'hover cannot exist in a raster',
  lagHandles: 'a lag handle is a drag target (ADR-0052 M3)',
  activeLagId: 'the lag drag in progress',
  gestureSourceId: 'the bar a gesture started on',
  barFill: 'a per-bar override the canvas threads for live preview during a drag',
  barInk: 'as barFill — the paired ink for that preview',
  baselineGhosts:
    'a lens toggle whose export behaviour is TECH_DEBT #164 follow-up, not settled here',
  flaggedIds: 'the conflict cycle highlights one bar at a time; a picture has no cursor',
};

/**
 * Parse the top-level keys of a scene composition.
 *
 * The two files spell it differently — the canvas seeds a ref (`useRef<TsldScene>({ … })`), the
 * export builds a local (`const scene = { … }`) — so the anchor is a parameter rather than a
 * guess. It **throws** when it cannot find one: a gate that cannot see its own input must refuse
 * rather than answer, because a default is indistinguishable from a measurement in the report.
 * That is not hypothetical here — the first version of this file assumed both used `const scene`
 * and would have reported an empty canvas roster, i.e. no missing keys, i.e. green.
 */
function sceneKeys(file: string, anchor: string): string[] {
  const text = readFileSync(file, 'utf8');
  const start = text.indexOf(anchor);
  if (start === -1) throw new Error(`no \`${anchor}\` in ${file}`);
  let depth = 0;
  let end = start;
  for (let i = text.indexOf('{', start); i < text.length; i += 1) {
    if (text[i] === '{') depth += 1;
    else if (text[i] === '}') {
      depth -= 1;
      if (depth === 0) {
        end = i;
        break;
      }
    }
  }
  const body = text
    .slice(text.indexOf('{', start) + 1, end)
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/^\s*\/\/.*$/gm, '');
  // Top-level keys only: a nested object's keys are at depth > 0.
  const keys: string[] = [];
  let nest = 0;
  for (const line of body.split('\n')) {
    const trimmed = line.trim();
    // **Refuse rather than under-report.** A spread contributes keys this parser cannot see, so a
    // composition using one would look smaller than it is and the difference check would pass on
    // keys that are present. Silence would be indistinguishable from parity — the exact shape this
    // gate exists to catch — so it throws and the author writes the keys out.
    if (nest === 0 && trimmed.startsWith('...')) {
      throw new Error(
        `${file} composes its scene with a spread (${trimmed.slice(0, 40)}…), which this gate ` +
          `cannot resolve. Write the keys explicitly so the two rosters stay comparable.`,
      );
    }
    const match = /^([a-zA-Z][a-zA-Z0-9]*)\s*[:,]/.exec(trimmed);
    if (nest === 0 && match) keys.push(match[1]!);
    nest += (line.match(/[{[(]/g) ?? []).length - (line.match(/[}\])]/g) ?? []).length;
  }
  return keys;
}

describe('the exported diagram composes the same scene as the screen (structural)', () => {
  const canvasKeys = sceneKeys(CANVAS, 'useRef<TsldScene>({');
  const exportKeys = sceneKeys(EXPORT, 'const scene = {');

  it('the export roster is non-empty', () => {
    // ADR-0093's second assertion. The difference check below is satisfied equally by an export
    // that composes nothing at all, and a green suite could not then tell "the gap is closed"
    // from "the export stopped composing".
    expect(exportKeys.length).toBeGreaterThan(10);
  });

  it('every key the canvas composes is either exported or named screen-only, with a reason', () => {
    const missing = canvasKeys.filter((k) => !exportKeys.includes(k) && !(k in SCREEN_ONLY));
    expect(
      missing,
      `these scene keys are on the screen and absent from the export, and nobody has said why: ` +
        `${missing.join(', ')}.\nCompose them in the export, or name them in SCREEN_ONLY with a reason.`,
    ).toEqual([]);
  });

  it('SCREEN_ONLY names nothing the canvas has stopped composing', () => {
    // The other direction, so the list cannot rot into a record of keys that no longer exist.
    const stale = Object.keys(SCREEN_ONLY).filter((k) => !canvasKeys.includes(k));
    expect(
      stale,
      `SCREEN_ONLY names keys the canvas no longer composes: ${stale.join(', ')}`,
    ).toEqual([]);
  });
});
