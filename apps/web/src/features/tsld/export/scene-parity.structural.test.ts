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
 *
 * **Three of these reasons were wrong when first written, and a wrong reason is worse than a bare
 * absence because it closes the question.** `barFill`/`barInk` were described as "a per-bar
 * override the canvas threads for live preview during a drag"; they are the **Colour-by lens**, a
 * persistent view mode gated on `colourMode !== 'criticality'` (`TsldPanel.tsx:1091-1100`), with
 * nothing gesture-scoped about them. `flaggedIds` was described as the ADR-0094 conflict cycle;
 * it is the **over-allocation highlight** (ADR-0041), driven by its own toggle (`:1143-1146`) and
 * painted as a persistent badge on every flagged bar. Both were caught by a deferred review
 * reading the code, not by anything automatic.
 *
 * **Five entries are marked LENS, and that is a live question rather than a settled exclusion.**
 * A planner who colours by resource and exports gets a criticality-coloured picture; one who has
 * isolated a subnetwork exports the whole plan. That is the same screen-vs-deliverable divergence
 * this gate exists for, one category along — so it is filed as `docs/TECH_DEBT.md` #167 with the
 * enumeration attached, rather than resolved by a sentence here.
 */
const SCREEN_ONLY: Record<string, string> = {
  selectedId: 'a selection is a live interaction; a delivered picture has no selected bar',
  selectedIds: 'as selectedId — the plural selection (ADR-0080) is interaction state',
  showEdgeHandles: 'edge handles are grab targets, and paper has no pointer',
  dimmedIds: 'LENS — filter, isolate and float-path dimming, unioned; see TECH_DEBT #167',
  hoverId: 'hover cannot exist in a raster',
  lagHandles: 'a lag handle is a drag target (ADR-0052 M3)',
  activeLagId: 'the lag drag in progress',
  gestureSourceId: 'the bar a gesture started on',
  barFill: "LENS — the Colour-by mode's per-bar fill map; see TECH_DEBT #167",
  barInk: "LENS — the Colour-by mode's paired ink map; see TECH_DEBT #167",
  baselineGhosts: 'LENS — the baseline variance ghosts; see TECH_DEBT #167',
  flaggedIds: 'LENS — the over-allocation highlight (ADR-0041); see TECH_DEBT #167',
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
  // **Comments are stripped BEFORE brace matching, and that ordering is the whole correctness of
  // this function.** The first version matched braces over raw text and stripped comments after,
  // so an unbalanced brace inside a comment truncated the object's extent — and a scene key after
  // that point vanished from the roster. Reproduced: a comment reading "mirrors the } that closes
  // the band block" placed above a brand-new unexported key made all three assertions pass. The
  // gate could be silenced, on the exact defect it exists to catch, by a comment.
  const text = readFileSync(file, 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/^\s*\/\/.*$/gm, '');
  const start = text.indexOf(anchor);
  if (start === -1) {
    throw new Error(
      `no \`${anchor}\` in ${file}. A gate that cannot see its own input must refuse rather than ` +
        `answer — a default here reads as "no missing keys", which is indistinguishable from parity.`,
    );
  }
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
  const body = text.slice(text.indexOf('{', start) + 1, end);
  const keys: string[] = [];
  let nest = 0;
  for (const line of body.split('\n')) {
    const trimmed = line.trim();
    // **Refuse rather than under-report.** A spread contributes keys this parser cannot see, so a
    // composition using one would look smaller than it is and the difference check would pass on
    // keys that are present. Silence would be indistinguishable from parity.
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
  // The canvas composes the SAME object twice — the ref initialiser and the resync effect.
  const canvasResyncKeys = sceneKeys(CANVAS, 'sceneRef.current = {\n');
  const exportKeys = sceneKeys(EXPORT, 'const scene = {');

  it('both rosters are plausibly sized, so a truncated parse cannot read as parity', () => {
    // ADR-0093's second assertion, applied to BOTH sides. The difference check is satisfied
    // equally by an export that composes nothing and by a canvas roster the parser truncated —
    // and a green suite could not tell either from "the gap is closed". The canvas floor is the
    // one the comment-brace defect would have tripped.
    expect(canvasKeys.length, 'the canvas roster looks truncated').toBeGreaterThan(20);
  });

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

  it("the canvas's two compositions agree with each other", () => {
    // **`TsldCanvas` builds the scene object twice** — once to seed the ref and once in the resync
    // effect — and this gate read only the first. The pair agreeing is not an assumption worth
    // making: `TsldCanvas.tsx:841-843` records that it has already drifted once, which is why the
    // two flag expressions were hoisted to a shared const in the first place.
    //
    // Without this, a key added to the initialiser and forgotten in the effect passes every other
    // assertion here — the export would compose it, the difference would be empty, and the screen
    // would simply stop painting it after the first data change. Found by a deferred review.
    const missingFromResync = canvasKeys.filter((k) => !canvasResyncKeys.includes(k));
    const missingFromInit = canvasResyncKeys.filter((k) => !canvasKeys.includes(k));
    expect(
      { missingFromResync, missingFromInit },
      "the canvas's ref initialiser and its resync effect compose different scene keys",
    ).toEqual({ missingFromResync: [], missingFromInit: [] });
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
