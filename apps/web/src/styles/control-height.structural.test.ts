import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

/**
 * **Every control height in `components/ui/` reads `--control-h*`, or is a NAMED exception**
 * (ADR-0118 D1/D2, built at M4).
 *
 * `implementation-plan.md` M2-T2 required this and M2 shipped without it. What that cost is on the
 * record: the gate pass found `<Input className="h-9">` at two call sites — one of them in the
 * same file as the comment explaining why a literal beside a token is a defect, five hundred lines
 * apart — and an `OrgSwitcher` `<select className="h-9">` sitting in `<header>`, a surface the
 * coarse browser gate names as swept and could not see because its element query had no `select`.
 * Three literals, none of them findable by reading the diff.
 *
 * **Scope is the primitives, deliberately.** A feature can legitimately size a non-control box; a
 * primitive in `components/ui/` cannot, because whatever it decides every consumer inherits. The
 * browser sweep covers the surfaces; this covers the vocabulary.
 *
 * **Comments are stripped before scanning.** Four gates in this repository have now been caught
 * matching their own prose (`docs/TECH_DEBT.md` #162's sibling, the ADR-0097 weight ratchet, the
 * sizing ratchet, `reset-fills`), each time turning "explaining the rule" into "breaking it".
 */
const UI_DIR = join(process.cwd(), 'src/components/ui');

/** `h-<n>` / `size-<n>` / `min-h-<n>` at a Tailwind step that lands in control-height territory. */
const CONTROL_HEIGHT_LITERAL = /\b(?:min-)?(?:h|size)-(?:7|8|9|10|11|12|14)\b/;

/** Every quoted string in the source — the unit a class list is written in. */
const QUOTED = /'([^'\\]*(?:\\.[^'\\]*)*)'|"([^"\\]*(?:\\.[^"\\]*)*)"|`([^`\\]*(?:\\.[^`\\]*)*)`/g;

/**
 * **The rule is the PAIRING, not the literal** — corrected on this gate's first run, which is worth
 * keeping because the first version was wrong in the instructive direction.
 *
 * It reported `Button`'s own `icon: 'size-10 pointer-coarse:size-(--control-h)'` shape as an
 * offender, and the only reason it did not say so is that `button.tsx` had been blanket-exempted —
 * so the file carrying the pattern the rule exists to enforce was the one file the rule could not
 * see. A literal is correct **when it is the fine-pointer value beside a coarse token read**; that
 * is how "keep 40 on a mouse, take 44 on a thumb" is spelled, and banning it would ban the epic.
 *
 * What is a defect is a literal with **no** coarse companion in the same class string: it agrees
 * with the token today and cannot follow it.
 */
function isOffendingClassString(text: string): boolean {
  if (!CONTROL_HEIGHT_LITERAL.test(text)) return false;
  return !/pointer-coarse:[a-z-]*\(--control-h/.test(text);
}

/**
 * The named exceptions, by the exact string rather than by file. A file-level exemption hides
 * everything else in the file, which is how the first version of this gate blinded itself to
 * `button.tsx`. Every entry is either in ADR-0118 D1's exception list or is not a control.
 */
const EXCEPTIONS = new Map<string, string>([
  [
    'button.tsx::size-7',
    // `Button`'s `icon-sm`, ADR-0118 D1 exception 2: a container whose height is fixed
    // independently of it — `GanttRowMenu`'s `GANTT_ROW_HEIGHT` is the one meant to stay; the tree
    // and the spine still sit here until M2/M3 of `docs/specs/dense-row-touch-targets/`. Raising it
    // overflows the row rather than growing it (`docs/TECH_DEBT.md` #215). Tables take `icon-row`.
    "Button's icon-sm — ADR-0118 D1 exception 2, GanttRowMenu's row is fixed elsewhere (GANTT_ROW_HEIGHT)",
  ],
  [
    'button.tsx::h-11 px-6',
    "Button's lg is already 44 px on both pointers: above the house rule, not outside it",
  ],
  [
    'tabs.tsx::min-h-11',
    'a tab is already 44 px on both pointers: above the house rule, not outside it',
  ],
  [
    'page/empty-state.tsx::size-12',
    "the empty state's decorative glyph and its dish — nothing here is pressable, and the action " +
      'an empty state offers is a `Button` beside it, which the rule already governs',
  ],
  ['page/empty-state.tsx::size-9', 'the same decorative glyph at its non-page size'],
]);

const SRC_DIR = join(process.cwd(), 'src');

/** Every non-test source file under `src/`, relative to it, with `/` separators. */
function allSourceFiles(): string[] {
  return readdirSync(SRC_DIR, { recursive: true, encoding: 'utf8' })
    .filter((f) => /\.tsx?$/.test(f) && !f.includes('.test.') && !f.includes('.spec.'))
    .map((f) => f.split('\\').join('/'));
}

function sourceFiles(): string[] {
  return readdirSync(UI_DIR, { recursive: true, encoding: 'utf8' }).filter(
    (f) => (f.endsWith('.tsx') || f.endsWith('.ts')) && !f.includes('.test.'),
  );
}

/** Strip block and line comments so a docblock describing the rule cannot violate it. */
function stripComments(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
}

describe('control heights in the design-system primitives', () => {
  it('pair every literal with a coarse token read, or are a written exception', () => {
    const offenders: string[] = [];
    for (const file of sourceFiles()) {
      const code = stripComments(readFileSync(join(UI_DIR, file), 'utf8'));
      for (const match of code.matchAll(QUOTED)) {
        const text = match[1] ?? match[2] ?? match[3] ?? '';
        if (!isOffendingClassString(text)) continue;
        // Keyed `file::substring`, never by file alone. A file-level exemption hides everything
        // else in that file, which is exactly how this gate's first version blinded itself to
        // `button.tsx` — the one file carrying the pattern the rule exists to enforce.
        const exempt = [...EXCEPTIONS.keys()].some((k) => {
          const [f, needle] = k.split('::');
          return f === file && needle !== undefined && text.includes(needle);
        });
        if (exempt) continue;
        offenders.push(`${file}: "${text.slice(0, 90)}"`);
      }
    }
    expect(
      offenders,
      'a control height literal in a primitive cannot follow the input axis — it can only agree ' +
        'with the token until the token moves (ADR-0118 D2). Pair it with a ' +
        '`pointer-coarse:…-(--control-h)` read, or add the string to EXCEPTIONS with the reason.',
    ).toEqual([]);
  });

  it('every exception is a string that still exists, with a reason', () => {
    // The pinned positive. Without it the assertion above passes just as happily against an
    // EXCEPTIONS map full of strings nothing matches any more — a list of permissions for code
    // that has gone, which is how an exception list becomes a hole (ADR-0093's shape).
    for (const [key, reason] of EXCEPTIONS) {
      const [file, needle] = key.split('::');
      expect(file, `"${key}" is not in \`file::substring\` form`).toBeTruthy();
      expect(needle, `"${key}" is not in \`file::substring\` form`).toBeTruthy();
      const code = stripComments(readFileSync(join(UI_DIR, file as string), 'utf8'));
      expect(code, `the exception "${key}" matches nothing any more`).toContain(needle as string);
      expect(reason.length, `"${key}" has no reason`).toBeGreaterThan(20);
    }
  });

  it('defines `icon-sm` once and lets a call site take it only by name', () => {
    // The `button.tsx::size-7` exception above is a needle, and it stays green if `icon-sm` is
    // deleted, because `icon-row`'s string also contains `size-7`. So the variant's consumers are
    // counted at the call sites instead, comments stripped: a new `icon-sm` is a decision made here.
    //
    // Interim list (dense-row-touch-targets M1). The plan's end state is `GanttRowMenu` alone;
    // `HierarchyTree` leaves at M2 and `explorer-column` at M3, and each removes its line below.
    const EXPECTED = new Map<string, number>([
      ['components/layout/navigator/explorer-column.tsx', 1],
      ['features/gantt/components/GanttRowMenu.tsx', 1],
      ['features/navigator/components/HierarchyTree.tsx', 1],
    ]);
    const found = new Map<string, number>();
    let definitions = 0;
    for (const file of allSourceFiles()) {
      const code = stripComments(readFileSync(join(SRC_DIR, file), 'utf8'));
      if (file === 'components/ui/button.tsx') {
        definitions = (code.match(/'icon-sm'\s*:/g) ?? []).length;
        expect(code.match(/size="icon-sm"/g), 'Button must not use its own variant').toBeNull();
        continue;
      }
      const uses = (code.match(/icon-sm/g) ?? []).length;
      if (uses > 0) found.set(file, uses);
    }
    expect(definitions, "`icon-sm` is defined once, in button.tsx's size map").toBe(1);
    expect([...found].sort()).toEqual([...EXPECTED].sort());
    expect(found.has('features/gantt/components/GanttRowMenu.tsx')).toBe(true);
  });
});
