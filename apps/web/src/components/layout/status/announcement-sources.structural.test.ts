import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

const HERE = join(process.cwd(), 'src/components/layout/status');

/**
 * **Comments are stripped before anything is scanned, and this gate needed it on its first run.**
 *
 * Both assertions below went red against perfectly correct code, because they matched the
 * *docblock explaining why the rule exists* and the *comment explaining why the outlet is not a
 * violation of it*. That is the fourth instance this repository has recorded of a scan matching
 * prose — `reset-fills.structural.test.ts`, the ADR-0097 weight ratchet counting `font-medium`
 * inside its own docblocks, and the sizing ratchet that went red at the moment its own rule was
 * being obeyed — and the fifth is this one, written by someone who had read all three.
 *
 * A gate that punishes writing down the reasoning teaches people to stop writing it down.
 */
function code(name: string): string {
  return readFileSync(join(HERE, name), 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/\/\/.*$/gm, '');
}

/**
 * **The status bar announces nothing, and hosting a live region is not announcing.**
 *
 * `plan-facts.tsx` carries that rule in its own docblock and the reason is a race rather than a
 * preference: `announcer.tsx` is a single shared app-wide polite region that clears-then-sets on an
 * animation frame, so wiring five facts to it means one recalculation — which changes finish,
 * critical count and run state together — drops at least one message silently, and the reader cannot
 * tell which.
 *
 * The one-row header put a `role="status"` region **into** this row (the pen's sentence, portalled
 * from the identity row), which looks like a contradiction and is not: the pen's region is its own
 * element and has announced its own transitions since ADR-0028. Two independent live regions do not
 * race; one shared one does.
 *
 * That distinction is now load-bearing enough to be worth a gate rather than a paragraph, because
 * the obvious "improvement" — wiring a fact to the shared announcer now that the row demonstrably
 * contains a live region — reintroduces exactly the dropped-message defect, and nothing else in the
 * suite would report it.
 */
describe('the plan facts row is not an announcing surface', () => {
  it('declares no live region of its own', () => {
    // The pen's region is declared in `CompactPenStatus`, not here; this file only mounts an outlet
    // for it. A live region appearing in THIS file would be the facts starting to announce.
    // Verified red by adding `aria-live="polite"` to the row's own container.
    const source = code('plan-facts.tsx');
    expect(source).not.toMatch(/aria-live/);
    expect(source).not.toMatch(/role=["{']status/);
  });

  it('does not reach for the shared announcer', () => {
    // Verified red by importing `announce` into `plan-facts.tsx`.
    for (const file of ['plan-facts.tsx', 'plan-status-bar.tsx', 'schedule-state.ts']) {
      expect(code(file), `${file} reaches for the shared announcer`).not.toMatch(/announcer/);
    }
  });
});
