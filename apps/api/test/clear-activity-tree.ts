import { Prisma, type PrismaClient } from '@prisma/client';

/**
 * Delete every activity and every row that holds a foreign key into one, in an order **derived from
 * the schema**.
 *
 * **Why this exists.** `activities` has RESTRICT foreign keys from its children (steps, notes,
 * assignments, links, and since ADR-0174 the history table), so anything hard-deleting activities
 * has to name every child first. Thirteen places did that by hand or not at all, and the history
 * table would have broken every one of them. It is `clear-baseline-tree.ts`'s pattern applied to
 * the next parent (`docs/TECH_DEBT.md` #253's lesson): ask `Prisma.dmmf`, never list.
 *
 * **Every child is deleted, including any `onDelete: Cascade` one** — here the goal is only that no
 * rows survive, and an explicit delete of a cascade child is a redundant statement, not an error.
 * The self-reference `activities.parent_id` is not a child: one `deleteMany` statement removes a
 * whole tree (ADR-0096 D7).
 *
 * **Siblings are checked, not assumed.** If one child ever holds a foreign key into another this
 * throws rather than guessing an order.
 *
 * Test-harness only: nothing in `src/` may import it.
 */
export async function clearActivityTree(prisma: PrismaClient): Promise<void> {
  for (const model of activityChildModels()) {
    const delegate = (prisma as unknown as Record<string, { deleteMany: () => Promise<unknown> }>)[
      model.charAt(0).toLowerCase() + model.slice(1)
    ];
    if (!delegate) {
      throw new Error(
        `clearActivityTree: no Prisma delegate for model "${model}". The DMMF names it as a child ` +
          `of Activity, so this is a naming assumption that has stopped holding rather than a ` +
          `missing table.`,
      );
    }
    await delegate.deleteMany();
  }
  await prisma.activity.deleteMany();
}

/**
 * The distinct models holding a to-one foreign key into `Activity`, excluding `Activity` itself.
 * Exported so the spec can pin a positive case against an empty walk.
 */
export function activityChildModels(): string[] {
  const children = new Set<string>();
  for (const model of Prisma.dmmf.datamodel.models) {
    if (model.name === 'Activity') continue;
    for (const field of model.fields) {
      if (
        field.kind === 'object' &&
        field.relationFromFields?.length &&
        field.type === 'Activity'
      ) {
        children.add(model.name);
      }
    }
  }

  for (const model of Prisma.dmmf.datamodel.models) {
    if (!children.has(model.name)) continue;
    for (const field of model.fields) {
      if (field.kind === 'object' && field.relationFromFields?.length && children.has(field.type)) {
        throw new Error(
          `clearActivityTree: "${model.name}" holds a foreign key into its sibling "${field.type}". ` +
            `The children of Activity have been independent of one another, so this helper deletes ` +
            `them in DMMF order; that is no longer safe. Order them explicitly.`,
        );
      }
    }
  }
  return [...children];
}
