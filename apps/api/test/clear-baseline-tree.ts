import { Prisma, type PrismaClient } from '@prisma/client';

/**
 * Delete every baseline and its snapshot children, in an order **derived from the schema**.
 *
 * **Why this exists** (`docs/TECH_DEBT.md` #253). `baseline` has a RESTRICT foreign key from each
 * of its snapshot children, so anything clearing baselines has to name every child first — and
 * until this file, thirteen places named them by hand: `audit-reset.ts` and twelve e2e specs, each
 * with the same four lines in the same order. Adding `baseline_dependencies` (ADR-0126) broke
 * **557 of 587** API e2e tests at once, in thirteen files, on one FK violation.
 *
 * That breakage was the LOUD kind and is not what makes this debt. The quiet twin is
 * `common/hierarchy/hierarchy-expiry.runner.ts`, where the same omission catches, logs a permanent
 * failure and retries hourly forever — which is why that one already has a DMMF-derived census in
 * `hierarchy-expiry.structural.spec.ts`. **The runner was protected and the test harness was not**,
 * so a fourteenth child table would fail thirteen files again and this helper is what stops it.
 *
 * **The children are asked of `Prisma.dmmf`, never listed.** That is the whole point: a new child
 * of `baselines` is swept the day its model lands, with no edit here and none in the thirteen
 * callers. Listing them in one place instead of thirteen would be an improvement that still has to
 * be remembered, and remembering is exactly what failed.
 *
 * **Order among the children is free, and that is checked rather than assumed.** None of the three
 * holds a foreign key into another (verified against the DMMF, 2026-09-06), so they can go in any
 * order before the parent. A future child that DID reference a sibling would make a blind order
 * wrong, so this throws instead of guessing — a loud failure at the point of use, on the day the
 * model lands, beats a delete that silently leaves rows behind.
 *
 * **Every child is deleted, including any `onDelete: Cascade` one.** This deliberately differs from
 * the retention runner, which must NOT name a cascade child (the database removes it, and naming it
 * is what that census refuses). Here the goal is only that no rows survive, and deleting a cascade
 * child explicitly is a redundant statement rather than an error — one rule with no branch.
 *
 * Test-harness only. Nothing in `src/` may import it: production deletes baselines through the
 * hierarchy lifecycle and the retention runner, both of which have their own ordering and their own
 * gate.
 */
export async function clearBaselineTree(prisma: PrismaClient): Promise<void> {
  for (const model of baselineChildModels()) {
    // The delegate name is the model name with a lower-cased initial — Prisma's own convention,
    // and the only mapping between a DMMF model and its client property.
    const delegate = (prisma as unknown as Record<string, { deleteMany: () => Promise<unknown> }>)[
      model.charAt(0).toLowerCase() + model.slice(1)
    ];
    if (!delegate) {
      throw new Error(
        `clearBaselineTree: no Prisma delegate for model "${model}". The DMMF names it as a child ` +
          `of Baseline, so this is a naming assumption that has stopped holding rather than a ` +
          `missing table.`,
      );
    }
    await delegate.deleteMany();
  }
  await prisma.baseline.deleteMany();
}

/**
 * The models holding a to-one foreign key into `Baseline`, in an order safe to delete.
 *
 * Exported for the one caller that needs to say what it swept; the sibling check lives here rather
 * than in a structural test so it fires wherever this helper is used, including in a spec run by
 * somebody who has never opened this file.
 */
export function baselineChildModels(): string[] {
  const children: string[] = [];
  for (const model of Prisma.dmmf.datamodel.models) {
    for (const field of model.fields) {
      if (
        field.kind === 'object' &&
        field.relationFromFields?.length &&
        field.type === 'Baseline'
      ) {
        children.push(model.name);
      }
    }
  }

  const childSet = new Set(children);
  for (const model of Prisma.dmmf.datamodel.models) {
    if (!childSet.has(model.name)) continue;
    for (const field of model.fields) {
      if (field.kind === 'object' && field.relationFromFields?.length && childSet.has(field.type)) {
        throw new Error(
          `clearBaselineTree: "${model.name}" holds a foreign key into its sibling "${field.type}". ` +
            `The children of Baseline have always been independent of one another, so this helper ` +
            `deletes them in DMMF order; that is no longer safe. Order them explicitly.`,
        );
      }
    }
  }

  return children;
}
