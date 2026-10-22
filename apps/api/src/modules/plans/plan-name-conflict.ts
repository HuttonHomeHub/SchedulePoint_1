import { Prisma } from '@prisma/client';

import { ConflictError } from '../../common/errors/domain-errors';
import { HIERARCHY_CONFLICT } from '../../common/hierarchy/hierarchy-lifecycle.service';

/**
 * A Prisma unique-violation from the partial name-per-project index (`uq_plans_project_name`, the
 * only unique a plan insert or rename can trip besides its generated id). Shared by the plan
 * service and the importer, so a plan name clash reads the same wherever the plan is made.
 */
export function isPlanNameConflict(error: unknown): boolean {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002';
}

export function planNameTakenError(): ConflictError {
  return new ConflictError('A plan with this name already exists for this project.', {
    reason: HIERARCHY_CONFLICT.NAME_TAKEN,
  });
}
