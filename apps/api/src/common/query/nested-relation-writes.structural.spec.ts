import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

import * as ts from 'typescript';
import { describe, expect, it } from 'vitest';

/**
 * **No nested relation write touches the composite-key relations of P6 activity codes or swimlanes**
 * (docs/specs/p6-activity-codes/database-design.md §16, decisions D-P1 and D-P2).
 *
 * **Why this is a gate and not a review rule.** The M2-T1 probe ran Prisma 6.19.3 against these
 * shapes and found its nested-write API wrong in ways that pass every test checking the stored row
 * is consistent:
 *
 *  1. `plan.update({ data: { swimlaneCodeType: { connect } } })` emits `UPDATE plans SET id = …`,
 *     because the relation's `fields` include the plan's own `id`;
 *  2. `swimlaneCodeType: { disconnect: true }` is silently dropped (Prisma cannot null `id`);
 *  3. two `connect`s on relations sharing `code_type_id` (an assignment's `codeType` and
 *     `codeValue`) keep the LAST one: a planner asking for Trade gets Area, and the row is
 *     consistent, so no foreign key refuses it.
 *
 * The scalar (unchecked) form behaves as designed in every case, so these relations are written
 * through their columns only (`swimlaneCodeTypeId`, `codeTypeId`, `codeValueId`, `planId`,
 * `activityId`, `swimlaneId`).
 *
 * **What is refused.** Inside the `data` of a `create`, `createMany`, `update`, `updateMany`,
 * `updateManyAndReturn` (or the `create`/`update` of an `upsert`) on any model, a property naming a
 * relation is refused when its value is an object carrying a nested-write key (`connect`,
 * `connectOrCreate`, `disconnect`, `set`, `create`, `createMany`, `update`, `updateMany`, `upsert`,
 * `delete`, `deleteMany`) AND the relation is guarded:
 *
 *  - any relation whose TARGET is `CodeType`, `CodeValue`, `CodeValueAssignment` or
 *    `CodeSwimlaneLane` (so `Plan.swimlaneCodeType`, `Plan.codeTypes`, `Activity.codeValueAssignments`,
 *    `Organization.codeTypes`, …);
 *  - any relation declared ON one of those four models (`CodeValueAssignment.codeType`, `.codeValue`,
 *    `.activity`, `CodeValue.codeType`, `CodeType.plan`, …);
 *  - `Activity.swimlane` and its back-relation `Swimlane.members` (D-P2: the same composite shape,
 *    `(plan_id, swimlane_id)`).
 *
 * A nested `create`/`update` is followed into its target model, so a guarded relation two levels
 * down is still found. **The roster is derived** (ADR-0136) from `prisma/schema.prisma`: a new
 * relation into a code model is under the check with no edit here.
 *
 * **What it cannot see**, by structure (ADR-0124): a `data` passed as a variable or built by a helper,
 * a spread (`...fields`), a model reached through a computed or aliased accessor, and code outside
 * `apps/api/src` (tests and the seed packages). Every one of those is a false negative, never a
 * false alarm. Reads (`include`, `select`) are not writes and are out of scope; a to-one include of
 * these relations is the ADR-0172 matter the schema's comments already forbid.
 */

const API_ROOT = join(__dirname, '../../..');
const SRC_ROOT = join(API_ROOT, 'src');
const SCHEMA_PATH = join(API_ROOT, 'prisma/schema.prisma');

const CODE_MODELS = new Set(['CodeType', 'CodeValue', 'CodeValueAssignment', 'CodeSwimlaneLane']);
/** D-P2: the swimlane membership relation has the same composite shape. */
const GUARDED_PAIRS = new Set(['Activity.swimlane', 'Swimlane.members']);

const NESTED_WRITE_KEYS = new Set([
  'connect',
  'connectOrCreate',
  'disconnect',
  'set',
  'create',
  'createMany',
  'update',
  'updateMany',
  'upsert',
  'delete',
  'deleteMany',
]);

const DATA_OPERATIONS = new Set([
  'create',
  'createMany',
  'createManyAndReturn',
  'update',
  'updateMany',
  'updateManyAndReturn',
]);

interface Relation {
  target: string;
}

interface SchemaModel {
  name: string;
  relations: Map<string, Relation>;
}

/** Models by Prisma client accessor (`codeValueAssignment`), with their relation fields. */
function readSchemaModels(schema: string): Map<string, SchemaModel> {
  const modelNames = [...schema.matchAll(/^model (\w+) \{/gm)].map((m) => m[1]!);
  const known = new Set(modelNames);
  const byAccessor = new Map<string, SchemaModel>();
  for (const match of schema.matchAll(/^model (\w+) \{([\s\S]*?)^\}/gm)) {
    const name = match[1]!;
    const relations = new Map<string, Relation>();
    for (const line of match[2]!.split('\n')) {
      const field = /^\s+(\w+)\s+(\w+)(\[\])?\??\s*(.*)$/.exec(line);
      if (!field) continue;
      const [, fieldName, type] = field;
      if (known.has(type!)) relations.set(fieldName!, { target: type! });
    }
    byAccessor.set(name.charAt(0).toLowerCase() + name.slice(1), { name, relations });
  }
  return byAccessor;
}

function isGuarded(model: string, field: string, target: string): boolean {
  return (
    CODE_MODELS.has(model) || CODE_MODELS.has(target) || GUARDED_PAIRS.has(`${model}.${field}`)
  );
}

function propertyName(node: ts.ObjectLiteralElementLike): string | undefined {
  if (!ts.isPropertyAssignment(node)) return undefined;
  const name = node.name;
  if (ts.isIdentifier(name) || ts.isStringLiteral(name)) return name.text;
  return undefined;
}

function propertyValue(object: ts.ObjectLiteralExpression, key: string): ts.Expression | undefined {
  for (const property of object.properties) {
    if (propertyName(property) === key && ts.isPropertyAssignment(property)) {
      return property.initializer;
    }
  }
  return undefined;
}

interface Finding {
  file: string;
  line: number;
  relation: string;
  key: string;
}

/** Every nested write to a guarded relation in one source file. */
function findGuardedNestedWrites(
  file: string,
  text: string,
  models: Map<string, SchemaModel>,
): Finding[] {
  const source = ts.createSourceFile(file, text, ts.ScriptTarget.Latest, true);
  const findings: Finding[] = [];
  const byName = new Map([...models.values()].map((m) => [m.name, m]));

  const checkData = (modelName: string, data: ts.Expression | undefined): void => {
    if (!data) return;
    if (ts.isArrayLiteralExpression(data)) {
      for (const element of data.elements) checkData(modelName, element);
      return;
    }
    if (!ts.isObjectLiteralExpression(data)) return;
    const model = byName.get(modelName);
    if (!model) return;
    for (const property of data.properties) {
      const key = propertyName(property);
      if (key === undefined || !ts.isPropertyAssignment(property)) continue;
      const relation = model.relations.get(key);
      if (!relation || !ts.isObjectLiteralExpression(property.initializer)) continue;
      const nested = property.initializer;
      for (const inner of nested.properties) {
        const innerKey = propertyName(inner);
        if (innerKey === undefined || !NESTED_WRITE_KEYS.has(innerKey)) continue;
        if (isGuarded(model.name, key, relation.target)) {
          const { line } = source.getLineAndCharacterOfPosition(inner.getStart(source));
          findings.push({ file, line: line + 1, relation: `${model.name}.${key}`, key: innerKey });
        }
      }
      // Follow nested creates and updates into the target model.
      for (const followKey of ['create', 'update']) {
        checkData(relation.target, propertyValue(nested, followKey));
      }
      const createMany = propertyValue(nested, 'createMany');
      if (createMany && ts.isObjectLiteralExpression(createMany)) {
        checkData(relation.target, propertyValue(createMany, 'data'));
      }
      const connectOrCreate = propertyValue(nested, 'connectOrCreate');
      if (connectOrCreate && ts.isObjectLiteralExpression(connectOrCreate)) {
        checkData(relation.target, propertyValue(connectOrCreate, 'create'));
      }
      const upsert = propertyValue(nested, 'upsert');
      if (upsert && ts.isObjectLiteralExpression(upsert)) {
        checkData(relation.target, propertyValue(upsert, 'create'));
        checkData(relation.target, propertyValue(upsert, 'update'));
      }
    }
  };

  const visit = (node: ts.Node): void => {
    if (
      ts.isCallExpression(node) &&
      ts.isPropertyAccessExpression(node.expression) &&
      ts.isPropertyAccessExpression(node.expression.expression)
    ) {
      const operation = node.expression.name.text;
      const model = models.get(node.expression.expression.name.text);
      const args = node.arguments[0];
      if (model && args && ts.isObjectLiteralExpression(args)) {
        if (DATA_OPERATIONS.has(operation)) checkData(model.name, propertyValue(args, 'data'));
        if (operation === 'upsert') {
          checkData(model.name, propertyValue(args, 'create'));
          checkData(model.name, propertyValue(args, 'update'));
        }
      }
    }
    ts.forEachChild(node, visit);
  };
  visit(source);
  return findings;
}

function sourceFiles(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir)) {
    const path = join(dir, entry);
    if (statSync(path).isDirectory()) out.push(...sourceFiles(path));
    else if (entry.endsWith('.ts') && !entry.endsWith('.spec.ts') && !entry.endsWith('.d.ts')) {
      out.push(path);
    }
  }
  return out;
}

const models = readSchemaModels(readFileSync(SCHEMA_PATH, 'utf8'));

describe('nested relation writes on composite-key relations (database-design §16 D-P1/D-P2)', () => {
  it('reads the guarded relations from the schema', () => {
    // Pinned so a schema edit that renames or drops one of them is noticed here rather than
    // silently shrinking the gate's subject.
    expect(models.get('plan')?.relations.get('swimlaneCodeType')?.target).toBe('CodeType');
    expect(models.get('plan')?.relations.get('codeTypes')?.target).toBe('CodeType');
    expect(models.get('codeValueAssignment')?.relations.get('codeValue')?.target).toBe('CodeValue');
    expect(models.get('codeSwimlaneLane')?.relations.get('activity')?.target).toBe('Activity');
    expect(models.get('activity')?.relations.get('swimlane')?.target).toBe('Swimlane');
    expect(models.get('swimlane')?.relations.get('members')?.target).toBe('Activity');
  });

  it('finds no nested write to a guarded relation anywhere in apps/api/src', () => {
    const findings = sourceFiles(SRC_ROOT).flatMap((path) =>
      findGuardedNestedWrites(relative(API_ROOT, path), readFileSync(path, 'utf8'), models),
    );
    expect(
      findings.map(
        (f) => `${f.file}:${f.line} ${f.relation}: { ${f.key} } — write the scalar column`,
      ),
    ).toEqual([]);
  });

  // ADR-0110: a gate is verified against the defect it names. Each case is one of the probe's
  // failures, or a shape that must stay allowed.
  const check = (text: string): string[] =>
    findGuardedNestedWrites('fixture.ts', text, models).map((f) => `${f.relation}.${f.key}`);

  it('refuses the plan pointer written through connect or disconnect (probe items 1 and 2)', () => {
    expect(
      check(
        `tx.plan.update({ where: { id }, data: { swimlaneCodeType: { connect: { planId_id: k } } } });`,
      ),
    ).toEqual(['Plan.swimlaneCodeType.connect']);
    expect(
      check(
        `this.prisma.plan.update({ where, data: { swimlaneCodeType: { disconnect: true } } });`,
      ),
    ).toEqual(['Plan.swimlaneCodeType.disconnect']);
  });

  it('refuses two connects sharing code_type_id on an assignment (probe item 3)', () => {
    expect(
      check(
        `db.codeValueAssignment.create({ data: { activity: { connect: { planId_id: a } }, ` +
          `codeType: { connect: { planId_id: t } }, codeValue: { connect: { codeTypeId_id: v } } } });`,
      ),
    ).toEqual([
      'CodeValueAssignment.activity.connect',
      'CodeValueAssignment.codeType.connect',
      'CodeValueAssignment.codeValue.connect',
    ]);
  });

  it('refuses a nested create into a code model from its parent, and follows nesting', () => {
    expect(
      check(`prisma.plan.update({ where, data: { codeTypes: { create: { name: 'A' } } } });`),
    ).toEqual(['Plan.codeTypes.create']);
    expect(
      check(
        `prisma.organization.update({ where, data: { codeTypes: { createMany: { data: [] } } } });`,
      ),
    ).toEqual(['Organization.codeTypes.createMany']);
    expect(
      check(
        `prisma.plan.create({ data: { name: 'P', activities: { create: { name: 'a', ` +
          `swimlane: { connect: { planId_id: s } } } } } });`,
      ),
    ).toEqual(['Activity.swimlane.connect']);
  });

  it('refuses the swimlane membership relation from either side (D-P2)', () => {
    expect(
      check(`tx.activity.update({ where, data: { swimlane: { disconnect: true } } });`),
    ).toEqual(['Activity.swimlane.disconnect']);
    expect(check(`tx.swimlane.update({ where, data: { members: { set: [] } } });`)).toEqual([
      'Swimlane.members.set',
    ]);
  });

  it('reads both halves of an upsert', () => {
    expect(
      check(
        `tx.codeSwimlaneLane.upsert({ where, create: { codeValue: { connect: { codeTypeId_id: v } } }, ` +
          `update: { codeType: { connect: { planId_id: t } } } });`,
      ),
    ).toEqual(['CodeSwimlaneLane.codeValue.connect', 'CodeSwimlaneLane.codeType.connect']);
  });

  it('admits scalar writes and nested writes on relations outside the guarded set', () => {
    expect(
      check(
        `tx.plan.update({ where, data: { swimlaneSource: 'ACTIVITY_CODE', swimlaneCodeTypeId: t } });` +
          `db.codeValueAssignment.createMany({ data: rows });` +
          `db.codeValueAssignment.create({ data: { planId, activityId, codeTypeId, codeValueId } });` +
          `prisma.note.create({ data: { activity: { connect: { id } } } });` +
          `prisma.activity.update({ where, data: { steps: { deleteMany: {} } } });`,
      ),
    ).toEqual([]);
  });
});
