import { DECORATORS } from '@nestjs/swagger';
import { describe, expect, it } from 'vitest';

import { CrossPlanChangeReportDto } from './cross-plan-revision-compare.dto';
import { RevisionChangeReportDto } from './revision-compare.dto';

/**
 * The OpenAPI text of `placementNotAssessableReason` states what the field means today
 * (`docs/TECH_DEBT.md` #405).
 *
 * It said "No placement comparison is implemented yet" on both revision routes for the 13 days after
 * the comparison shipped (2026-09-29): a wrong claim in the published contract, which no behavioural
 * test could see because the behaviour was right and only the sentence was wrong. A description is
 * not executable, so the check is on the metadata a generated client reads. `revisionDatesBasis`
 * decides `PLACED` versus `NETWORK`, and the field is null exactly when it says `PLACED`
 * (`schedule.service.ts` derives one from the other), which is the claim the text now makes.
 */
function description(dto: new () => object, property: string): string {
  const meta = Reflect.getMetadata(DECORATORS.API_MODEL_PROPERTIES, dto.prototype, property) as
    { description?: string } | undefined;
  if (!meta?.description) throw new Error(`${dto.name}.${property} has no OpenAPI description`);
  return meta.description;
}

describe.each([
  ['the plan-nested revision comparison', RevisionChangeReportDto],
  ['the cross-plan revision comparison', CrossPlanChangeReportDto],
])('%s: placementNotAssessableReason', (_route, dto) => {
  const text = description(dto, 'placementNotAssessableReason');

  it('does not say placement comparison is unimplemented', () => {
    expect(text).not.toMatch(/not implemented|no placement comparison/i);
    expect(text).not.toMatch(/still run on early dates on both sides/i);
  });

  it('ties the field to the dates basis the read used', () => {
    expect(text).toContain('`datesBasis: PLACED`');
  });
});
