import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

import * as ts from 'typescript';
import { describe, expect, it } from 'vitest';

/**
 * Every top-level read of a soft-deletable model states what it means to do about deleted rows
 * (ADR-0172, `docs/specs/soft-delete-filter/`).
 *
 * **Why this is a gate.** `docs/DATABASE.md` once said a Prisma extension filtered deleted rows
 * centrally. None exists: filtering is per query, in about two hundred places, by repositories
 * and by services alike. A forgotten `deletedAt: null` shows a deleted row, or computes on it, and
 * nothing fails. The opposite mistake is just as real and has shipped — a filter on a read that
 * must see deleted rows (restore, the bin, the retention sweep, `findHoursPerDayMinutes`). So the
 * rule is not "always filter"; it is **"say which"**. A read passes when its `where` carries a
 * `deletedAt` key with any value, or comes from a helper whose returned object does, or is
 * preceded by a declaration:
 *
 *   `// soft-delete: any-state — <reason of at least 10 characters>` (or `deleted-only`)
 *
 * on the comment lines above the call, above the statement or member that contains it, or in the
 * docblock of the enclosing function. A declaration with no reason, in another shape, or that
 * covers no read is refused (ADR-0124: find by structure, refuse by declaration), and every
 * declaration is printed by the run (US-5) so a reviewer reads the list rather than searching.
 *
 * **This milestone checks top-level reads only** — `findMany`, `findFirst`, `findFirstOrThrow`,
 * `findUnique`, `findUniqueOrThrow`, `count`, `aggregate`, `groupBy`. Writes, nested
 * `include`/`select`/`_count` and raw SQL are later milestones of the same plan; a green run here
 * says nothing about them.
 *
 * **The roster is derived** (ADR-0136) from `prisma/schema.prisma`: a model with a `deletedAt`
 * field is soft-deletable, so a 21st model is under the check with no edit here.
 *
 * **A helper is recognised by structure, never by name** (ADR-0124): a function, method or arrow
 * variable whose every returned expression states a stance. Helpers are looked up in the call's
 * own file first, then across the tree; a name defined more than once must be a helper in every
 * definition to count.
 *
 * **What it cannot see.** A wrong stance — `deletedAt: { not: null }` where `null` was meant —
 * passes. A `where` built in another function and passed in is refused, so that is a false alarm
 * costing a declaration, never a miss. Whether a declaration's reason is true is a reviewer's
 * job; the gate only makes it visible. Receiver-agnostic: it keys on `.<accessor>.<operation>(`,
 * so `db.`, `tx.`, `client.` and `this.prisma.` are one shape, and a model reached through a
 * computed property name (`prisma[name]`) is invisible.
 */

const API_ROOT = join(__dirname, '../../..');
const SRC_ROOT = join(API_ROOT, 'src');
const SCHEMA_PATH = join(API_ROOT, 'prisma/schema.prisma');

/** Same exclusions as `tsconfig.build.json`: tests and the conformance harness are not shipped. */
const EXCLUDED_DIRS = [join('src', 'modules', 'schedule', 'conformance')];

const READ_OPERATIONS = new Set([
  'findMany',
  'findFirst',
  'findFirstOrThrow',
  'findUnique',
  'findUniqueOrThrow',
  'count',
  'aggregate',
  'groupBy',
]);

const DECLARATION_MARKER = /soft-delete:/;
const DECLARATION_GRAMMAR = /soft-delete:\s*(any-state|deleted-only)\s*(?:—|--?)\s*([\s\S]*)/;
const MIN_REASON_LENGTH = 10;
const HELPER_DEPTH_LIMIT = 6;

// ---------------------------------------------------------------------------------------------
// Roster
// ---------------------------------------------------------------------------------------------

interface SoftDeletableModel {
  model: string;
  accessor: string;
}

/** Models whose block holds a `deletedAt` **field** line — not a comment that mentions one. */
function deriveRoster(schema: string): SoftDeletableModel[] {
  const roster: SoftDeletableModel[] = [];
  let current: string | null = null;
  let hasDeletedAt = false;
  for (const line of schema.split('\n')) {
    const open = /^model\s+(\w+)\s*\{/.exec(line);
    if (open) {
      current = open[1] ?? null;
      hasDeletedAt = false;
      continue;
    }
    if (current === null) continue;
    if (/^\s+deletedAt\s+DateTime\?/.test(line)) hasDeletedAt = true;
    if (/^\}/.test(line)) {
      if (hasDeletedAt) {
        roster.push({
          model: current,
          accessor: current.charAt(0).toLowerCase() + current.slice(1),
        });
      }
      current = null;
    }
  }
  return roster;
}

// ---------------------------------------------------------------------------------------------
// Scanner
// ---------------------------------------------------------------------------------------------

interface Finding {
  file: string;
  line: number;
  message: string;
}

interface Declaration {
  file: string;
  line: number;
  kind: string;
  reason: string;
  /** Distinct reads whose missing stance this declaration stands in for. */
  covers: string[];
}

interface ScanResult {
  sitesExamined: number;
  findings: Finding[];
  declarations: Declaration[];
}

interface HelperDefinition {
  file: string;
  returns: ts.Expression[];
}

type Sources = Record<string, string>;

const unwrap = (node: ts.Expression): ts.Expression => {
  let current = node;
  while (
    ts.isParenthesizedExpression(current) ||
    ts.isAsExpression(current) ||
    ts.isSatisfiesExpression(current) ||
    ts.isNonNullExpression(current)
  ) {
    current = current.expression;
  }
  return current;
};

const propertyName = (name: ts.PropertyName): string | null =>
  ts.isIdentifier(name) || ts.isStringLiteral(name) ? name.text : null;

/** Return expressions of a function body, not descending into nested functions. */
function returnedExpressions(fn: ts.Node): ts.Expression[] {
  const found: ts.Expression[] = [];
  const body = (fn as ts.FunctionLikeDeclaration).body;
  if (body === undefined) return found;
  if (!ts.isBlock(body)) {
    found.push(body);
    return found;
  }
  const visit = (node: ts.Node): void => {
    if (ts.isFunctionLike(node)) return;
    if (ts.isReturnStatement(node) && node.expression) found.push(node.expression);
    ts.forEachChild(node, visit);
  };
  ts.forEachChild(body, visit);
  return found;
}

function collectHelpers(files: Map<string, ts.SourceFile>): Map<string, HelperDefinition[]> {
  const index = new Map<string, HelperDefinition[]>();
  const add = (name: string, file: string, fn: ts.Node): void => {
    const list = index.get(name) ?? [];
    list.push({ file, returns: returnedExpressions(fn) });
    index.set(name, list);
  };
  for (const [file, source] of files) {
    const visit = (node: ts.Node): void => {
      if ((ts.isFunctionDeclaration(node) || ts.isMethodDeclaration(node)) && node.name) {
        if (ts.isIdentifier(node.name)) add(node.name.text, file, node);
      } else if (
        (ts.isVariableDeclaration(node) || ts.isPropertyDeclaration(node)) &&
        ts.isIdentifier(node.name) &&
        node.initializer &&
        (ts.isArrowFunction(node.initializer) || ts.isFunctionExpression(node.initializer))
      ) {
        add(node.name.text, file, node.initializer);
      }
      ts.forEachChild(node, visit);
    };
    visit(source);
  }
  return index;
}

class Analyser {
  private readonly sources = new Map<string, ts.SourceFile>();
  private readonly helpers: Map<string, HelperDefinition[]>;
  private readonly accessors: Map<string, string>;

  constructor(sources: Sources, roster: SoftDeletableModel[], extraHelperSources: Sources = {}) {
    for (const [file, text] of Object.entries(sources)) this.sources.set(file, parse(file, text));
    const helperFiles = new Map(this.sources);
    for (const [file, text] of Object.entries(extraHelperSources)) {
      helperFiles.set(file, parse(file, text));
    }
    this.helpers = collectHelpers(helperFiles);
    this.accessors = new Map(roster.map((m) => [m.accessor, m.model]));
  }

  scan(): ScanResult {
    const findings: Finding[] = [];
    const declarations: Declaration[] = [];
    let sitesExamined = 0;

    for (const [file, source] of this.sources) {
      const declared = this.declarationsIn(file, source, findings);
      const consumed = new Map<number, Set<string>>();

      const visit = (node: ts.Node): void => {
        if (ts.isCallExpression(node)) {
          const site = this.readSite(node);
          if (site) {
            sitesExamined += 1;
            const line = lineOf(source, node);
            if (!this.hasStance(node, site.where, file, 0)) {
              const covering = this.coveringDeclaration(node, declared);
              if (covering) {
                const set = consumed.get(covering.pos) ?? new Set<string>();
                set.add(`${site.model}.${site.operation}@${line}`);
                consumed.set(covering.pos, set);
              } else {
                findings.push({
                  file,
                  line,
                  message:
                    `${file}:${line} — ${site.model}.${site.operation} has no deletedAt stance ` +
                    '(filter it, or declare why not)',
                });
              }
            }
          }
        }
        ts.forEachChild(node, visit);
      };
      visit(source);

      for (const decl of declared.values()) {
        const covers = [...(consumed.get(decl.pos) ?? [])];
        if (covers.length === 0) {
          findings.push({
            file,
            line: decl.line,
            message:
              `${file}:${decl.line} — declaration does not precede a read on a soft-deletable ` +
              'model that needs it',
          });
        } else if (decl.valid) {
          declarations.push({
            file,
            line: decl.line,
            kind: decl.kind,
            reason: decl.reason,
            covers,
          });
        }
      }
    }
    return { sitesExamined, findings, declarations };
  }

  /** `<anything>.<accessor>.<readOperation>(...)` on a roster model. */
  private readSite(
    call: ts.CallExpression,
  ): { model: string; operation: string; where: ts.Expression | null } | null {
    const callee = call.expression;
    if (!ts.isPropertyAccessExpression(callee) || !ts.isIdentifier(callee.name)) return null;
    const operation = callee.name.text;
    if (!READ_OPERATIONS.has(operation)) return null;
    const receiver = callee.expression;
    if (!ts.isPropertyAccessExpression(receiver) || !ts.isIdentifier(receiver.name)) return null;
    const model = this.accessors.get(receiver.name.text);
    if (model === undefined) return null;
    return { model, operation, where: whereOf(call.arguments[0]) };
  }

  private hasStance(
    call: ts.CallExpression,
    where: ts.Expression | null,
    file: string,
    depth: number,
  ): boolean {
    if (where === null) return false;
    return this.stance(where, file, depth, call);
  }

  /** Does this expression, as a `where`, state a `deletedAt` condition on every branch? */
  private stance(expression: ts.Expression, file: string, depth: number, at: ts.Node): boolean {
    if (depth > HELPER_DEPTH_LIMIT) return false;
    const node = unwrap(expression);

    if (ts.isObjectLiteralExpression(node)) {
      return node.properties.some((property) => {
        if (ts.isSpreadAssignment(property)) {
          return this.stance(property.expression, file, depth + 1, at);
        }
        if (ts.isShorthandPropertyAssignment(property)) return property.name.text === 'deletedAt';
        if (!ts.isPropertyAssignment(property)) return false;
        const name = propertyName(property.name);
        if (name === 'deletedAt') return true;
        if (name === 'AND') {
          const value = unwrap(property.initializer);
          const parts = ts.isArrayLiteralExpression(value) ? [...value.elements] : [value];
          return parts.some((part) => this.stance(part, file, depth + 1, at));
        }
        return false;
      });
    }
    if (ts.isConditionalExpression(node)) {
      return (
        this.stance(node.whenTrue, file, depth + 1, at) &&
        this.stance(node.whenFalse, file, depth + 1, at)
      );
    }
    if (
      ts.isBinaryExpression(node) &&
      (node.operatorToken.kind === ts.SyntaxKind.QuestionQuestionToken ||
        node.operatorToken.kind === ts.SyntaxKind.BarBarToken)
    ) {
      return (
        this.stance(node.left, file, depth + 1, at) && this.stance(node.right, file, depth + 1, at)
      );
    }
    if (ts.isCallExpression(node)) return this.helperStance(node, file, depth);
    if (ts.isIdentifier(node)) {
      const initialisers = resolveLocal(node, at);
      if (initialisers.length === 0) return false;
      return initialisers.every((init) => this.stance(init, file, depth + 1, init));
    }
    return false;
  }

  private helperStance(call: ts.CallExpression, file: string, depth: number): boolean {
    const callee = call.expression;
    const name = ts.isIdentifier(callee)
      ? callee.text
      : ts.isPropertyAccessExpression(callee)
        ? callee.name.text
        : null;
    if (name === null) return false;
    const all = this.helpers.get(name) ?? [];
    const local = all.filter((d) => d.file === file);
    const definitions = local.length > 0 ? local : all;
    if (definitions.length === 0) return false;
    return definitions.every(
      (def) =>
        def.returns.length > 0 &&
        def.returns.every((expr) => this.stance(expr, def.file, depth + 1, expr)),
    );
  }

  /** The declaration comment covering this call: nearest enclosing node that carries one. */
  private coveringDeclaration(
    call: ts.CallExpression,
    declared: Map<number, ParsedDeclaration>,
  ): ParsedDeclaration | null {
    for (let node: ts.Node | undefined = call; node; node = node.parent) {
      const text = node.getSourceFile().getFullText();
      for (const range of ts.getLeadingCommentRanges(text, node.getFullStart()) ?? []) {
        const hit = declared.get(range.pos);
        if (hit) return hit;
      }
      if (ts.isFunctionDeclaration(node) || ts.isMethodDeclaration(node)) break;
    }
    return null;
  }

  private declarationsIn(
    file: string,
    source: ts.SourceFile,
    findings: Finding[],
  ): Map<number, ParsedDeclaration> {
    const result = new Map<number, ParsedDeclaration>();
    const text = source.getFullText();
    const seen = new Set<number>();
    const note = (pos: number, end: number): void => {
      if (seen.has(pos)) return;
      seen.add(pos);
      const raw = text.slice(pos, end);
      if (!DECLARATION_MARKER.test(raw)) return;
      const cleaned = raw
        .replace(/^\/\*+|\*+\/$/g, '')
        .split('\n')
        .map((l) => l.replace(/^\s*(\/\/+|\*+)\s?/, '').trim())
        .join(' ');
      const match = DECLARATION_GRAMMAR.exec(cleaned);
      const line = source.getLineAndCharacterOfPosition(pos).line + 1;
      const reason = match?.[2]?.trim() ?? '';
      const valid = match !== null && reason.length >= MIN_REASON_LENGTH;
      if (!valid) {
        findings.push({
          file,
          line,
          message:
            `${file}:${line} — soft-delete declaration is malformed or names no reason ` +
            `(expected "soft-delete: any-state|deleted-only — <reason ≥ ${MIN_REASON_LENGTH} chars>")`,
        });
      }
      result.set(pos, { pos, line, kind: match?.[1] ?? '', reason, valid });
    };
    const visit = (node: ts.Node): void => {
      for (const range of ts.getLeadingCommentRanges(text, node.getFullStart()) ?? []) {
        note(range.pos, range.end);
      }
      ts.forEachChild(node, visit);
    };
    visit(source);
    return result;
  }
}

interface ParsedDeclaration {
  pos: number;
  line: number;
  kind: string;
  reason: string;
  valid: boolean;
}

function parse(file: string, text: string): ts.SourceFile {
  return ts.createSourceFile(file, text, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);
}

const lineOf = (source: ts.SourceFile, node: ts.Node): number =>
  source.getLineAndCharacterOfPosition(node.getStart(source)).line + 1;

/** The `where` of a Prisma call's first argument, or null when it has none we can read. */
function whereOf(arg: ts.Expression | undefined): ts.Expression | null {
  if (arg === undefined) return null;
  const options = unwrap(arg);
  if (!ts.isObjectLiteralExpression(options)) return null;
  for (const property of options.properties) {
    if (ts.isShorthandPropertyAssignment(property) && property.name.text === 'where') {
      return property.name;
    }
    if (
      ts.isPropertyAssignment(property) &&
      propertyName(property.name) === 'where' &&
      property.initializer
    ) {
      return property.initializer;
    }
  }
  return null;
}

/**
 * Initialisers of the local `const`/`let` an identifier names, searched outward from `at` through
 * each enclosing block. A parameter, an import or a value from another file yields none, which
 * the caller reads as "no stance" — a false alarm, never a miss.
 */
function resolveLocal(identifier: ts.Identifier, at: ts.Node): ts.Expression[] {
  const found: ts.Expression[] = [];
  for (let scope: ts.Node | undefined = at; scope; scope = scope.parent) {
    if (!ts.isBlock(scope) && !ts.isSourceFile(scope)) continue;
    for (const statement of scope.statements) {
      if (!ts.isVariableStatement(statement)) continue;
      for (const decl of statement.declarationList.declarations) {
        if (ts.isIdentifier(decl.name) && decl.name.text === identifier.text && decl.initializer) {
          found.push(decl.initializer);
        }
      }
    }
    if (found.length > 0) return found;
  }
  return found;
}

// ---------------------------------------------------------------------------------------------
// The real tree
// ---------------------------------------------------------------------------------------------

function listSources(dir: string): string[] {
  const files: string[] = [];
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (EXCLUDED_DIRS.some((excluded) => full.endsWith(excluded))) continue;
    if (statSync(full).isDirectory()) {
      files.push(...listSources(full));
      continue;
    }
    if (entry.endsWith('.ts') && !entry.endsWith('.spec.ts') && !entry.endsWith('.e2e-spec.ts')) {
      files.push(full);
    }
  }
  return files;
}

const roster = deriveRoster(readFileSync(SCHEMA_PATH, 'utf8'));

function scanTree(): ScanResult {
  const sources: Sources = {};
  for (const file of listSources(SRC_ROOT)) {
    sources[relative(API_ROOT, file)] = readFileSync(file, 'utf8');
  }
  return new Analyser(sources, roster).scan();
}

/** Run the scanner over synthetic sources; the first is the one under test. */
const check = (source: string, extra: Sources = {}): ScanResult =>
  new Analyser({ 'synthetic.ts': source }, roster, extra).scan();

const messages = (result: ScanResult): string[] => result.findings.map((f) => f.message);

describe('soft-delete roster', () => {
  it('derives the soft-deletable models from schema.prisma', () => {
    // 20 of 34 models on 2026-10-03. The number is pinned so a parse that silently matches
    // nothing — or a comment mentioning `deletedAt` counted as a field — cannot pass (ADR-0093).
    expect(
      roster.map((m) => m.model),
      `roster is ${roster.map((m) => m.model).join(', ')}`,
    ).toHaveLength(20);
    expect(roster).toEqual(
      expect.arrayContaining([
        { model: 'Activity', accessor: 'activity' },
        { model: 'BaselineActivity', accessor: 'baselineActivity' },
        { model: 'Organization', accessor: 'organization' },
      ]),
    );
  });

  it('ignores a comment that mentions deletedAt and a model without the field', () => {
    const schema = [
      'model Plain {',
      '  // deletedAt is mentioned here only',
      '  id String',
      '}',
      'model Gone {',
      '  deletedAt DateTime? @map("deleted_at")',
      '}',
    ].join('\n');
    expect(deriveRoster(schema)).toEqual([{ model: 'Gone', accessor: 'gone' }]);
  });
});

describe('soft-delete scanner — synthetic sources', () => {
  it('passes a where that carries a deletedAt key, whatever its value', () => {
    for (const value of ['null', '{ not: null }', '{ lt: cutoff }']) {
      const result = check(`
        async function f(db: Db, cutoff: Date) {
          return db.activity.findMany({ where: { planId: 'p', deletedAt: ${value} } });
        }`);
      expect(result.findings).toEqual([]);
      expect(result.sitesExamined).toBe(1);
    }
  });

  it('fails a where with no deletedAt, naming file, line, model and operation', () => {
    const result = check(`
      async function f(db: Db) {
        return db.activity.findMany({ where: { planId: 'p' } });
      }`);
    expect(messages(result)).toEqual([
      'synthetic.ts:3 — Activity.findMany has no deletedAt stance (filter it, or declare why not)',
    ]);
  });

  it('keys on the accessor and the operation whatever the receiver is called', () => {
    for (const receiver of ['this.prisma', 'db', 'tx', 'client']) {
      const result = check(`const x = ${receiver}.plan.count({ where: { id } });`);
      expect(result.findings, receiver).toHaveLength(1);
    }
  });

  it('examines every read operation and ignores writes and creates', () => {
    const ops = [
      'findMany',
      'findFirst',
      'findFirstOrThrow',
      'findUnique',
      'findUniqueOrThrow',
      'count',
      'aggregate',
      'groupBy',
    ];
    for (const op of ops) {
      expect(check(`db.note.${op}({ where: { id } });`).findings, op).toHaveLength(1);
    }
    expect(
      check('db.note.update({ where: { id }, data: {} }); db.note.create({ data: {} });'),
    ).toMatchObject({ sitesExamined: 0, findings: [] });
  });

  it('ignores a model with no deletedAt and a non-Prisma look-alike', () => {
    expect(check('db.session.findMany({ where: { id } });').sitesExamined).toBe(0);
    expect(check('items.activity.map(x => x);').sitesExamined).toBe(0);
  });

  it('handles a multi-line call', () => {
    const result = check(`
      const rows = await this.prisma.resource
        .findMany({
          where: {
            orgId,
          },
        });`);
    expect(result.findings).toHaveLength(1);
  });

  it('fails a read with no where at all', () => {
    expect(check('db.client.findMany();').findings).toHaveLength(1);
    expect(check('db.client.findMany({ orderBy: { name: "asc" } });').findings).toHaveLength(1);
  });

  it('passes a helper that returns a deletedAt object, recognised by structure', () => {
    const result = check(`
      class R {
        private live(where: object) { return { ...where, deletedAt: null }; }
        a() { return this.db.project.findMany({ where: this.live({ clientId }) }); }
        b() { return this.db.project.count({ where: { ...this.live({ clientId }), name: 'x' } }); }
      }`);
    expect(result.findings).toEqual([]);
    expect(result.sitesExamined).toBe(2);
  });

  it('recognises an arrow helper, an exported predicate and a helper that spreads a helper', () => {
    const result = check(`
      const alive = () => ({ deletedAt: null });
      function wrapped(extra: object) { return { ...alive(), ...extra }; }
      function both() { return { AND: [wrapped({}), { id }] }; }
      db.note.findMany({ where: alive() });
      db.note.findMany({ where: wrapped({ id }) });
      db.note.findMany({ where: both() });`);
    expect(result.findings).toEqual([]);
  });

  it('resolves a helper defined in another file', () => {
    const result = check('db.invitation.count({ where: pending(orgId) });', {
      'other.ts': 'function pending(orgId: string) { return { orgId, deletedAt: null }; }',
    });
    expect(result.findings).toEqual([]);
  });

  it('refuses a helper that does not state a stance, and one unknown helper name', () => {
    const result = check(`
      function plain(id: string) { return { id }; }
      db.note.findMany({ where: plain(id) });
      db.note.findMany({ where: mystery(id) });`);
    expect(result.findings).toHaveLength(2);
  });

  it('refuses a name defined twice when only one definition is a helper', () => {
    const result = check('db.note.findMany({ where: dup(id) });', {
      'a.ts': 'function dup() { return { deletedAt: null }; }',
      'b.ts': 'function dup(id: string) { return { id }; }',
    });
    expect(result.findings).toHaveLength(1);
  });

  it('resolves a local variable within the same function', () => {
    const ok = check(`
      function f() {
        const where = { id, deletedAt: null };
        return db.note.findMany({ where });
      }`);
    expect(ok.findings).toEqual([]);
    const bad = check(`
      function f() {
        const where = { id };
        return db.note.findMany({ where });
      }`);
    expect(bad.findings).toHaveLength(1);
  });

  it('refuses a where that is an unresolvable parameter', () => {
    const result = check('function f(where: object) { return db.note.findMany({ where }); }');
    expect(result.findings).toHaveLength(1);
  });

  it('passes a ternary only when both branches state a stance', () => {
    const ok = check(
      'db.note.findMany({ where: a ? { id, deletedAt: null } : { id, deletedAt: { not: null } } });',
    );
    expect(ok.findings).toEqual([]);
    const bad = check('db.note.findMany({ where: a ? { id, deletedAt: null } : { id } });');
    expect(bad.findings).toHaveLength(1);
  });

  it('counts a deletedAt key inside an AND, and not inside an OR or a relation filter', () => {
    expect(
      check('db.note.findMany({ where: { AND: [{ id }, { deletedAt: null }] } });').findings,
    ).toEqual([]);
    expect(
      check('db.note.findMany({ where: { OR: [{ deletedAt: null }, { id }] } });').findings,
    ).toHaveLength(1);
    // The queried model's own column is the subject, not its parent's.
    expect(
      check('db.activity.findMany({ where: { plan: { deletedAt: null } } });').findings,
    ).toHaveLength(1);
  });

  describe('declarations', () => {
    it('accepts a declaration above the call, with a reason', () => {
      const result = check(`
        function f() {
          // soft-delete: any-state — restore must find the row it is restoring
          return db.client.findFirst({ where: { id } });
        }`);
      expect(result.findings).toEqual([]);
      expect(result.declarations).toHaveLength(1);
      expect(result.declarations[0]).toMatchObject({
        kind: 'any-state',
        reason: 'restore must find the row it is restoring',
        covers: ['Client.findFirst@4'],
      });
    });

    it('accepts deleted-only, and a docblock above the enclosing method', () => {
      const result = check(`
        class R {
          /**
           * Reads the bin.
           * soft-delete: deleted-only — the recycle bin lists deleted rows by design.
           */
          bin() {
            const a = db.client.findMany({ where: { orgId } });
            const b = db.project.findMany({ where: { orgId } });
            return [a, b];
          }
        }`);
      expect(result.findings).toEqual([]);
      expect(result.declarations[0]?.covers).toHaveLength(2);
    });

    it('lets a statement-level declaration cover the whole statement', () => {
      const result = check(`
        async function f() {
          // soft-delete: any-state — the sweep reads rows of every state on purpose
          const [a, b] = await Promise.all([
            db.note.findMany({ where: { orgId } }),
            db.note.count({ where: { orgId } }),
          ]);
        }`);
      expect(result.findings).toEqual([]);
      expect(result.declarations[0]?.covers).toHaveLength(2);
    });

    it('refuses a declaration with no reason, a short reason, or the wrong shape', () => {
      for (const comment of [
        '// soft-delete: any-state —',
        '// soft-delete: any-state — short',
        '// soft-delete: whatever — a perfectly long reason here',
        '// soft-delete: any-state a perfectly long reason with no dash',
      ]) {
        const result = check(`
          function f() {
            ${comment}
            return db.client.findFirst({ where: { id } });
          }`);
        expect(
          result.findings.some((f) => f.message.includes('malformed or names no reason')),
          comment,
        ).toBe(true);
      }
    });

    it('refuses a stale declaration: none that covers a read needing it', () => {
      const none = check(`
        // soft-delete: any-state — nothing below needs this declaration at all
        const x = 1;`);
      expect(messages(none)).toEqual([
        expect.stringContaining('does not precede a read on a soft-deletable model'),
      ]);
      const filtered = check(`
        function f() {
          // soft-delete: any-state — but the read below already filters, so this is stale
          return db.client.findFirst({ where: { id, deletedAt: null } });
        }`);
      expect(filtered.findings).toHaveLength(1);
    });

    it('does not let a declaration above one function cover a read in a later one', () => {
      const result = check(`
        // soft-delete: any-state — this covers the first function and nothing after it
        function a() { return db.client.findFirst({ where: { id } }); }
        function b() { return db.client.findFirst({ where: { id } }); }`);
      expect(result.findings).toHaveLength(1);
      expect(result.findings[0]?.line).toBe(4);
    });
  });
});

describe('soft-delete gate — the repository tree', () => {
  const result = scanTree();

  it('examined a plausible number of read sites — the pinned positive case (ADR-0093)', () => {
    // The spec's single-line count was a floor of 175; the AST scan sees multi-line callees too.
    // A scanner that stops recognising a receiver shape drops below this and fails here rather
    // than reporting a clean tree.
    expect(result.sitesExamined).toBeGreaterThanOrEqual(150);
  });

  it('every top-level read of a soft-deletable model states a deletedAt stance', () => {
    expect(
      result.findings.map((f) => f.message),
      'filter the read (usually via the repository active() helper), or declare why it must see ' +
        'deleted rows: `// soft-delete: any-state — <reason>`',
    ).toEqual([]);
  });

  it('lists every declaration with its reason, and there is at least one', () => {
    const lines = result.declarations.map(
      (d) => `${d.file}:${d.line} ${d.kind} (${d.covers.length}) — ${d.reason}`,
    );
    process.stdout.write(`soft-delete declarations: ${lines.length}\n${lines.join('\n')}\n`);
    // A scanner that finds no declarations would pass every other assertion by finding nothing.
    expect(result.declarations.length).toBeGreaterThan(0);
  });
});
