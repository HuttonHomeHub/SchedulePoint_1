import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

/**
 * **The four gates ADR-0140's narrowing of ADR-0086 D6 depends on.**
 *
 * ADR-0086 D1 is a *negative* type property: `StaffPrincipal` lacks fields, so assignment to
 * `Principal` fails, and only an edit to one watched file can defeat it. The diagnostics boundary is
 * a *positive* property on one return type, and ADR-0140 D3 states plainly that this is weaker in
 * three ways. These gates are the three repairs plus the registry's uniformity rule — they are what
 * "the scalar boundary is a declared contract held by a reviewable seam plus four gates, not a
 * compile error" means in practice.
 *
 * | Gate | Assertion | Verified red against |
 * | ---- | --------- | -------------------- |
 * | S-1 | every property on the row DTO is `number`, except the two registry literals | `planName: string` |
 * | S-2 | the `diagnostics` handler declares no `@Query()` / `@Body()` / `@Param()` | adding `@Query() q: Dto` |
 * | S-4 | the SQL projection is `count(...)` expressions only | adding `, a.name` |
 * | S-5 | every registry entry produces the fixed row shape | an entry with an extra key |
 *
 * **Each carries a pinned positive case over a synthetic source**, and the predicate is separated
 * from the file it reads so that positive is not circular. An assertion of the form "every X is
 * safe" passes perfectly against a scan that found no X — ADR-0108's census did exactly that on its
 * first run, and ADR-0093 records the general shape. Where a predicate reads real source, comments
 * are stripped first: four gates in this repository have reported their own docblocks as
 * violations, and `staff-boundary.structural.spec.ts:28-41` records that defect and its fix.
 */

const STAFF_DIR = __dirname;
const DTO_PATH = join(STAFF_DIR, 'dto', 'staff-diagnostics.dto.ts');
const REGISTRY_PATH = join(STAFF_DIR, 'staff-diagnostics.registry.ts');
const REPOSITORY_PATH = join(STAFF_DIR, 'staff-diagnostics.repository.ts');
// The SQL lives in the REGISTRY, not the repository — see the S-4 docblock for why that placement
// departs from the plan, and for the second assertion that keeps this gate from having a hole.
const SQL_PATH = REGISTRY_PATH;
const CONTROLLER_PATH = join(STAFF_DIR, 'staff.controller.ts');

/** Source with comments removed. See the docblock above for why this is necessary, not fastidious. */
function stripComments(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');
}

function read(path: string): string {
  // A missing file is a FAILURE, never a skip. These gates were written before the code they
  // govern (ADR-0140 D4), and a gate that quietly passes while its subject does not exist is the
  // one failure mode that would make the whole ordering pointless.
  expect(existsSync(path), `${path} must exist — these gates govern it`).toBe(true);
  return stripComments(readFileSync(path, 'utf8'));
}

// ---------------------------------------------------------------------------------------------
// S-1 — the row DTO is all numbers
// ---------------------------------------------------------------------------------------------

/**
 * The properties allowed to be non-numeric, because they are the registry's own literals.
 *
 * **Each one carries a fact about the QUESTION and never about this installation**, which is the
 * discriminator rather than "we decided these three were fine". `id` and `label` name the question;
 * `nature` says what a non-zero answer to it means. None of them varies with the data, so none of
 * them can disclose anything — and that is why widening this list is a decision about the registry's
 * vocabulary rather than a hole in clause 1.
 *
 * A free-text `description` was the M4 UX review's first suggestion and was refused for the
 * opposite reason: `string` is not a closed vocabulary, so the gate could no longer tell a literal
 * from a value somebody interpolated.
 */
const LITERAL_PROPERTIES = ['id', 'label', 'nature'];

/**
 * Every property declaration on `class StaffDiagnosticRowDto`, as `name → declared type`.
 *
 * Deliberately a source scan rather than a type-level test: the point is to fail LOUDLY the moment
 * somebody adds the field, and a type test only fails once a caller depends on it — the argument
 * `staff-boundary.structural.spec.ts:65-66` already makes for `StaffPrincipal`.
 */
function rowProperties(source: string): { name: string; type: string }[] {
  const start = source.indexOf('class StaffDiagnosticRowDto');
  expect(start, 'StaffDiagnosticRowDto must exist').toBeGreaterThanOrEqual(0);

  const open = source.indexOf('{', start);
  let depth = 0;
  let end = open;
  for (let i = open; i < source.length; i += 1) {
    if (source[i] === '{') depth += 1;
    if (source[i] === '}') {
      depth -= 1;
      if (depth === 0) {
        end = i;
        break;
      }
    }
  }

  // Decorator bodies are stripped FIRST, and that is not tidiness. `@ApiProperty({ enum: X,
  // description: '…' })` is full of `name: value` pairs, and the first version of this scan read
  // them as property declarations — reporting `enum: DIAGNOSTIC_IDS, description: …` as a
  // non-numeric property of the DTO. The same shape as a gate matching its own docblock, one
  // syntax along: the scan must see what the class DECLARES, not what its annotations say about it.
  const body = stripDecorators(source.slice(open + 1, end));
  const out: { name: string; type: string }[] = [];
  // `name!: type;` — the DTO convention throughout (`staff-health.dto.ts`). `?` and a bare `:` are
  // matched too: `planName?: string` typechecks under `strictPropertyInitialization` where
  // `planName: string` does not, so a gate keyed on `!` alone would have one way out of it.
  for (const match of body.matchAll(/^[ \t]*([A-Za-z_$][\w$]*)\s*[!?]?\s*:\s*([^;\n]+);/gm)) {
    out.push({ name: match[1]!, type: match[2]!.trim() });
  }
  return out;
}

/** Remove `@Decorator(...)` blocks, parentheses balanced, so their contents are not read as code. */
function stripDecorators(source: string): string {
  let out = '';
  for (let i = 0; i < source.length; i += 1) {
    if (source[i] !== '@') {
      out += source[i];
      continue;
    }
    const open = source.indexOf('(', i);
    const nextLine = source.indexOf('\n', i);
    if (
      open === -1 ||
      (nextLine !== -1 && open > nextLine && !/^@[\w$.]+$/.test(source.slice(i, nextLine).trim()))
    ) {
      out += source[i];
      continue;
    }
    let depth = 0;
    let j = open;
    for (; j < source.length; j += 1) {
      if (source[j] === '(') depth += 1;
      if (source[j] === ')') {
        depth -= 1;
        if (depth === 0) break;
      }
    }
    i = j;
  }
  return out;
}

describe('S-1 — the diagnostic row DTO carries numbers and nothing else (ADR-0140 D3.1)', () => {
  it('declares every property as number, except the two registry literals', () => {
    const props = rowProperties(read(DTO_PATH));

    const offenders = props.filter(
      (p) => !LITERAL_PROPERTIES.includes(p.name) && p.type !== 'number',
    );

    expect(
      offenders.map((p) => `${p.name}: ${p.type}`),
      'a diagnostic row may carry only integers across the process boundary',
    ).toEqual([]);
  });

  it('has no index signature, which would make the shape open again', () => {
    expect(read(DTO_PATH)).not.toMatch(/\[\s*\w+\s*:\s*string\s*\]\s*:/);
  });

  it('catches a non-numeric property when it sees one, decorators and all', () => {
    // The pinned positive, over a synthetic class rather than the real file — so it proves the scan
    // does something, rather than proving the real file is currently fine.
    //
    // It carries decorators DELIBERATELY, and one of them names a `description:` whose text would
    // read as a property declaration if the stripping stopped working. That is the case the first
    // version of this gate failed, and it fails in the direction that matters: towards a false
    // POSITIVE, which gets the gate weakened by whoever is trying to land an unrelated change.
    // The `?` property is the other escape a `!`-keyed regex would leave open.
    const synthetic = `
      export class StaffDiagnosticRowDto {
        @ApiProperty({ enum: DIAGNOSTIC_IDS, description: 'thing: a value; and more' })
        id!: DiagnosticId;
        @ApiProperty()
        label!: string;
        @ApiProperty({ description: 'how many' })
        numerator!: number;
        @ApiProperty()
        planName!: string;
        capturedAt?: Date;
      }
    `;
    const props = rowProperties(synthetic);

    // Exactly the five real properties, and nothing from inside a decorator.
    expect(props.map((p) => p.name)).toEqual([
      'id',
      'label',
      'numerator',
      'planName',
      'capturedAt',
    ]);

    const offenders = props.filter(
      (p) => !LITERAL_PROPERTIES.includes(p.name) && p.type !== 'number',
    );
    expect(offenders.map((p) => p.name)).toEqual(['planName', 'capturedAt']);
  });
});

// ---------------------------------------------------------------------------------------------
// S-2 — the handler takes no caller input (ADR-0140 D2, clause 2)
// ---------------------------------------------------------------------------------------------

/** The parameter list of the named controller handler, as written. */
function handlerParameters(source: string, handler: string): string {
  const at = source.indexOf(`async ${handler}(`);
  expect(at, `the ${handler} handler must exist`).toBeGreaterThanOrEqual(0);

  const open = source.indexOf('(', at);
  let depth = 0;
  for (let i = open; i < source.length; i += 1) {
    if (source[i] === '(') depth += 1;
    if (source[i] === ')') {
      depth -= 1;
      if (depth === 0) return source.slice(open + 1, i);
    }
  }
  throw new Error(`unterminated parameter list for ${handler}`);
}

const INPUT_DECORATORS = ['@Query(', '@Body(', '@Param(', '@Headers('];

describe('S-2 — the diagnostics handler accepts no input (ADR-0140 D2, clause 2)', () => {
  it('declares no input decorator', () => {
    const params = handlerParameters(read(CONTROLLER_PATH), 'diagnostics');

    const offenders = INPUT_DECORATORS.filter((d) => params.includes(d));

    expect(
      offenders,
      'a parameter turns this count into a differencing oracle over customer data — the whole ' +
        'narrowing of ADR-0086 D6 rests on the caller being unable to vary the question',
    ).toEqual([]);
  });

  it('catches an input decorator when it sees one', () => {
    const synthetic = `
      async diagnostics(
        @CurrentStaff() staff: StaffPrincipal,
        @Query() query: SomeFilterDto,
      ): Promise<StaffDiagnosticsDto> {}
    `;
    const params = handlerParameters(synthetic, 'diagnostics');

    expect(INPUT_DECORATORS.filter((d) => params.includes(d))).toEqual(['@Query(']);
  });
});

// ---------------------------------------------------------------------------------------------
// S-4 — the SQL projects counts and nothing else (ADR-0140 D3.2)
// ---------------------------------------------------------------------------------------------

/**
 * The `SELECT` list of every SQL constant in the repository file.
 *
 * This is the repair for the second way the guarantee is weaker than ADR-0086 D1's:
 * `prisma.$queryRaw<{ n: bigint }[]>` is an unchecked **cast**, so TypeScript validates what the
 * service declares and never what Postgres returns. A column added to the projection would be
 * invisible to the compiler; it is not invisible to this.
 */
function projections(source: string): string[][] {
  const out: string[][] = [];
  for (const match of source.matchAll(/SELECT\s+([\s\S]*?)\s+FROM\s/gi)) {
    out.push(splitTopLevel(match[1]!).map((item) => item.trim()));
  }
  return out;
}

/** Split on commas that are not inside parentheses — `count(a, b)` is one item, not two. */
function splitTopLevel(list: string): string[] {
  const items: string[] = [];
  let depth = 0;
  let current = '';
  for (const ch of list) {
    if (ch === '(') depth += 1;
    if (ch === ')') depth -= 1;
    if (ch === ',' && depth === 0) {
      items.push(current);
      current = '';
      continue;
    }
    current += ch;
  }
  if (current.trim() !== '') items.push(current);
  return items;
}

const COUNT_WITH_ALIAS = /^count\s*\([\s\S]*\)\s+AS\s+[a-z_][a-z0-9_]*$/i;

describe('S-4 — the SQL projects counts only (ADR-0140 D3.2)', () => {
  it('projects nothing but aliased count expressions', () => {
    const lists = projections(read(SQL_PATH));

    expect(lists.length, 'the repository must contain at least one SELECT').toBeGreaterThan(0);

    const offenders: string[] = [];
    for (const list of lists) {
      for (const item of list) {
        if (!COUNT_WITH_ALIAS.test(item)) offenders.push(item);
      }
    }

    expect(offenders, 'only aliased count() expressions may be projected').toEqual([]);
  });

  it('interpolates nothing — the query takes no parameters, so injection is structural', () => {
    const source = read(SQL_PATH);
    const sqlTemplates = [...source.matchAll(/Prisma\.sql`([\s\S]*?)`/g)].map((m) => m[1]!);

    expect(sqlTemplates.length, 'the SQL must be a Prisma.sql tagged template').toBeGreaterThan(0);
    for (const template of sqlTemplates) {
      expect(template, 'zero interpolation — see ADR-0140 D5').not.toContain('${');
    }
  });

  /**
   * **The hole this closes, and the plan departure behind it.**
   *
   * The approved plan put "one SQL constant" in `StaffDiagnosticsRepository`. It is in the REGISTRY
   * instead, because a per-entry query held by the repository would make the repository know each
   * diagnostic by name — and then "adding a diagnostic is one registry entry and nothing else",
   * which is ADR-0140 D2 clause 3, would simply be false.
   *
   * That placement gives S-4 a hole unless this exists: the gate reads the registry, so SQL that
   * sprouted in the repository would be projected past it unseen. The repository runs what it is
   * handed and composes no SQL of its own, and this is what says so.
   */
  it('keeps all SQL in the registry, so the projection gate can see all of it', () => {
    const repository = read(REPOSITORY_PATH);

    expect(repository, 'the repository composes no SQL of its own').not.toContain('Prisma.sql');
    expect(repository, 'the repository projects nothing of its own').not.toMatch(/\bSELECT\b/i);
  });

  it('catches a projected column when it sees one', () => {
    const [list] = projections(
      'const q = Prisma.sql`SELECT count(*) AS affected, a.name FROM activities a WHERE x`;',
    );

    expect(list).toEqual(['count(*) AS affected', 'a.name']);
    expect(list!.filter((item) => !COUNT_WITH_ALIAS.test(item))).toEqual(['a.name']);
  });
});

// ---------------------------------------------------------------------------------------------
// S-5 — the registry is closed and uniform (ADR-0140 D2, clause 3)
// ---------------------------------------------------------------------------------------------

describe('S-5 — every registry entry produces the one fixed shape (ADR-0140 D2, clause 3)', () => {
  it('declares the entry type with exactly the closed key set — no more, no fewer', () => {
    const source = read(REGISTRY_PATH);
    const start = source.indexOf('interface DiagnosticEntry');
    expect(start, 'DiagnosticEntry must exist').toBeGreaterThanOrEqual(0);
    const body = source.slice(source.indexOf('{', start), source.indexOf('\n}', start));

    const declared = [...body.matchAll(/readonly\s+([A-Za-z_$][\w$]*)\s*[?]?\s*:/g)].map(
      (m) => m[1],
    );

    // **Set equality, not presence.** The first version asserted each of the five keys appeared
    // somewhere in the file, which is a different claim: adding `readonly filterHint?: string` to
    // the interface left it green while its own docblock said "a widened entry type cannot pass
    // unremarked". Found by the M4 test review. Scoped to the interface body as well, so a key
    // named in a comment or in an entry literal cannot satisfy it.
    expect(declared.sort()).toEqual(['denominator', 'id', 'label', 'nature', 'numerator']);
  });

  it('exports the registry frozen, so an entry cannot be added at runtime', () => {
    // **Scoped to the DIAGNOSTICS export.** A whole-file `toContain('as const')` was satisfied by
    // `DIAGNOSTIC_IDS` and `DIAGNOSTIC_NATURES`, which are different declarations entirely — so
    // deleting ` as const` from the registry itself, the exact defect this names, left the
    // assertion green forever. The second `as const` was added by this same milestone, which is
    // how a substring check goes from weak to vacuous without anybody touching it.
    expect(read(REGISTRY_PATH)).toMatch(/export const DIAGNOSTICS = \[[^\]]*\] as const;/);
  });

  /**
   * Every non-numeric property on the row is a CLOSED vocabulary, not a string.
   *
   * `LITERAL_PROPERTIES` above is the exception list for gate S-1, and an exception list is only
   * as good as the thing it admits: a `nature: string` would satisfy S-1 while being an open field
   * that anything could be interpolated into. This asserts each admitted literal is backed by an
   * `as const` vocabulary the registry exports, so widening the shape means widening a vocabulary
   * somebody has to write down.
   */
  it('backs every admitted literal with a closed vocabulary', () => {
    const source = read(REGISTRY_PATH);

    for (const vocabulary of ['DIAGNOSTIC_IDS', 'DIAGNOSTIC_NATURES']) {
      expect(source, `${vocabulary} must be a closed const vocabulary`).toMatch(
        new RegExp(`export const ${vocabulary} = \\[[^\\]]*\\] as const;`),
      );
    }
  });
});
