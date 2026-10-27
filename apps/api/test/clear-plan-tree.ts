import { Prisma, type PrismaClient } from '@prisma/client';

/**
 * Delete every plan and every row that holds a foreign key into one, directly or through an
 * activity, baseline or code type, in an order **derived from the schema**.
 *
 * **Why this exists** (`docs/TECH_DEBT.md` #253, a third time; `database-design.md` §8.5 of the P6
 * activity codes). Eight e2e specs reset the database by hand-listing plan children, then
 * `plan.deleteMany()`. Each new plan child (swimlanes, then code types) broke every list that had
 * not been taught, in a file that never heard of the feature. `clearActivityTree` and
 * `clearBaselineTree` took the same step for their parents; this is the next parent up, and like
 * them it asks `Prisma.dmmf` and never lists.
 *
 * **The order is a topological sort of the foreign keys**, children first, because the plan's
 * descendants are not independent of one another (`activity_dependencies` sit under activities,
 * `code_value_assignments` under both activities and code values). A cycle throws rather than being
 * guessed at.
 *
 * **The one edge that points the other way** is `plans.swimlane_code_type_id`: the plan holds a
 * RESTRICT key into its own code type. It is cleared before any code type is deleted. That is the
 * test-harness twin of the retention runner's `Plan→CodeType` exemption, and the helper throws if a
 * second such edge appears, so a new one cannot be skipped silently.
 *
 * Every row of every descendant table is deleted, `onDelete: Cascade` ones included: the goal is
 * only that nothing survives, and a redundant delete is not an error.
 *
 * Test-harness only: nothing in `src/` may import it.
 */
export async function clearPlanTree(prisma: PrismaClient): Promise<void> {
  const order = planDescendantModels();
  assertPlanPointers(new Set(order));
  // The pointer first; the CHECK ties it to the source, so both are cleared in one statement.
  await prisma.plan.updateMany({
    where: { swimlaneCodeTypeId: { not: null } },
    data: { swimlaneSource: 'NONE', swimlaneCodeTypeId: null },
  });
  for (const model of order) {
    const delegate = (prisma as unknown as Record<string, { deleteMany: () => Promise<unknown> }>)[
      model.charAt(0).toLowerCase() + model.slice(1)
    ];
    if (!delegate) {
      throw new Error(
        `clearPlanTree: no Prisma delegate for model "${model}". The DMMF names it as a descendant ` +
          `of Plan, so this is a naming assumption that has stopped holding rather than a missing table.`,
      );
    }
    await delegate.deleteMany();
  }
  await prisma.plan.deleteMany();
}

/** Every foreign key as a (holder, target, field) triple, self-relations omitted. */
function foreignKeys(): { holder: string; target: string; field: string }[] {
  const keys: { holder: string; target: string; field: string }[] = [];
  for (const model of Prisma.dmmf.datamodel.models) {
    for (const field of model.fields) {
      if (
        field.kind === 'object' &&
        field.relationFromFields?.length &&
        field.type !== model.name
      ) {
        keys.push({ holder: model.name, target: field.type, field: field.name });
      }
    }
  }
  return keys;
}

/**
 * The models that reach `Plan` through foreign keys, excluding `Plan`, ordered so a model comes
 * after every model holding a key into it. Exported so the spec can pin a positive case against an
 * empty walk.
 */
export function planDescendantModels(): string[] {
  // Plan's own keys (calendar, project, the code type pointer) point away from its descendants.
  const keys = foreignKeys().filter((k) => k.holder !== 'Plan');
  const descendants = new Set<string>(['Plan']);
  for (let grew = true; grew;) {
    grew = false;
    for (const key of keys) {
      if (descendants.has(key.target) && !descendants.has(key.holder)) {
        descendants.add(key.holder);
        grew = true;
      }
    }
  }
  descendants.delete('Plan');

  const remaining = new Set(descendants);
  const ordered: string[] = [];
  while (remaining.size > 0) {
    // A model is free once nothing still waiting holds a key into it.
    const free = [...remaining].filter(
      (model) => !keys.some((k) => k.target === model && remaining.has(k.holder)),
    );
    if (free.length === 0) {
      throw new Error(
        `clearPlanTree: foreign keys among [${[...remaining].join(', ')}] form a cycle. ` +
          `Break it explicitly, as the plan's code type pointer is.`,
      );
    }
    for (const model of free) {
      remaining.delete(model);
      ordered.push(model);
    }
  }
  return ordered;
}

/** Plan's keys into its own descendants must be exactly the one this helper clears. */
function assertPlanPointers(descendants: ReadonlySet<string>): void {
  const pointers = foreignKeys()
    .filter((k) => k.holder === 'Plan' && descendants.has(k.target))
    .map((k) => k.field);
  if (pointers.length !== 1 || pointers[0] !== 'swimlaneCodeType') {
    throw new Error(
      `clearPlanTree: Plan holds keys into its descendants through [${pointers.join(', ')}], ` +
        `but only swimlaneCodeType is cleared before the delete. Teach the helper the new one.`,
    );
  }
}
