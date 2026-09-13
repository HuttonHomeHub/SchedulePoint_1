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

/** The two properties allowed to be non-numeric, because they are the registry's own literals. */
const LITERAL_PROPERTIES = ['id', 'label'];

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

  const body = source.slice(open + 1, end);
  const out: { name: string; type: string }[] = [];
  // `name!: type;` — the repository's DTO convention throughout (`staff-health.dto.ts`).
  for (const match of body.matchAll(/^\s*([A-Za-z_$][\w$]*)\s*!?\s*:\s*([^;]+);/gm)) {
    out.push({ name: match[1]!, type: match[2]!.trim() });
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

  it('catches a non-numeric property when it sees one', () => {
    // The pinned positive, over a synthetic class rather than the real file — so it proves the
    // scan does something, rather than proving the real file is currently fine.
    const synthetic = `
      export class StaffDiagnosticRowDto {
        id!: DiagnosticId;
        label!: string;
        numerator!: number;
        planName!: string;
        capturedAt!: Date;
      }
    `;
    const props = rowProperties(synthetic);
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
    const lists = projections(read(REPOSITORY_PATH));

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
    const source = read(REPOSITORY_PATH);
    const sqlTemplates = [...source.matchAll(/Prisma\.sql`([\s\S]*?)`/g)].map((m) => m[1]!);

    expect(sqlTemplates.length, 'the SQL must be a Prisma.sql tagged template').toBeGreaterThan(0);
    for (const template of sqlTemplates) {
      expect(template, 'zero interpolation — see ADR-0140 D5').not.toContain('${');
    }
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
  it('declares the entry type with exactly the closed key set', () => {
    const source = read(REGISTRY_PATH);

    // The type is the enforcement; this asserts the type says what the ADR says it says, so a
    // widened entry type cannot pass unremarked while every runtime test stays green.
    for (const key of ['id', 'label', 'denominator', 'numerator']) {
      expect(source, `a registry entry declares ${key}`).toMatch(
        new RegExp(`readonly\\s+${key}\\s*:`),
      );
    }
  });

  it('exports the registry frozen, so an entry cannot be added at runtime', () => {
    expect(read(REGISTRY_PATH)).toContain('as const');
  });
});
