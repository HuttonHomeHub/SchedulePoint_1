/**
 * The words for a plan whose swimlanes are made from a code (p6-activity-codes M4) that only the
 * swimlanes feature speaks. The sentences the grids share with the editor live beside the grids'
 * (`features/tsld/model/swimlane-assignment.ts`), which `features/tsld` owns and this feature imports.
 */

/** The editor's field while the type's name or values have not arrived: the settled shape, no reason claimed yet. */
export const CODE_SWIMLANE_LOADING = 'Loading…';

/** What the editor's field reads for an activity with no live value, named for the type. */
export const noCodeValueName = (typeName: string): string => `No ${typeName}`;
