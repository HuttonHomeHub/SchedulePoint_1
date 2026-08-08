import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

/**
 * **Paste does not touch any ADR-0064 tool mode** (`docs/specs/activity-copy-paste/` M3-T3).
 *
 * The plan asked for a component test — paste while `add-activity` is armed leaves it armed; paste
 * while a link pick is open leaves the pick open. This asserts something **stronger** instead, and
 * the substitution is deliberate rather than a convenience.
 *
 * `setMode` and the open-pick state live entirely inside `TsldPanel`. `copySelection` and
 * `pasteClipboard` live in `use-plan-workspace-model.ts`, which imports neither and has no route to
 * either. A component test would mount the panel, arm a mode, invoke paste and observe that the mode
 * survived — proving the behaviour for the arrangement that exists on the day it was written. This
 * proves there is **nothing in reach to touch**, which is the fact the plan's prose was actually
 * claiming and the one that a later refactor would have to break loudly rather than quietly.
 *
 * The failure being guarded is silent in the way ADR-0064 was opened on: a planner arms Link, pastes
 * a copied phase, and finds the tool disarmed with no message — six link attempts producing zero
 * dependencies, which is exactly the report that started that epic.
 */
const MODEL = join(
  import.meta.dirname,
  '../../components/layout/workspace/use-plan-workspace-model.ts',
);

/** The tool-mode vocabulary (ADR-0064 §2): the four modes, and the setter that arms them. */
const TOOL_MODE_TOKENS = ['setMode', 'toolMode', "'add-activity'", "'add-milestone'", "'link'"];

describe('the clipboard composites cannot reach a tool mode', () => {
  it('the workspace model references no tool-mode setter or mode literal', () => {
    const source = readFileSync(MODEL, 'utf8');
    const found = TOOL_MODE_TOKENS.filter((token) => source.includes(token));
    expect(found, `use-plan-workspace-model.ts mentions ${found.join(', ')}`).toEqual([]);
  });

  it('the activity-copy feature imports nothing from the TSLD renderer', () => {
    // The other direction of the same seam. An import here would put `setMode` one destructure away
    // from `pasteClipboard`, and the next reader would have no reason not to use it.
    const source = readFileSync(join(import.meta.dirname, 'index.ts'), 'utf8');
    expect(source).not.toMatch(/from '@\/features\/tsld/);
  });
});
