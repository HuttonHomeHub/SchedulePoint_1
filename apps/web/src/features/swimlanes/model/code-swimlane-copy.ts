/**
 * The words for a plan whose swimlanes are made from a code (p6-activity-codes M4) that only the
 * swimlanes feature speaks. The sentences the grids share with the editor live beside the grids'
 * (`features/tsld/model/swimlane-assignment.ts`), which `features/tsld` owns and this feature imports.
 */

/** The editor's field while the type's name or values have not arrived: the settled shape, no reason claimed yet. */
export const CODE_SWIMLANE_LOADING = 'Loading…';

/** What the editor's field reads for an activity with no live value, named for the type. */
export const noCodeValueName = (typeName: string): string => `No ${typeName}`;

/**
 * Why the gutter's rename, move and delete are shaded while a code leads: a swimlane's name and order
 * live on the value, in Codes…. The Swimlanes… command is where the source is changed back, and that
 * command is never shaded by this reason, so the sentence cannot send a reader to a control it has shut
 * (the rule `wbs-swimlane-copy.ts` states for its own).
 */
export const codeGutterReason = (typeName: string | undefined): string =>
  `Swimlanes follow ${typeName ?? 'a code'} in this plan. Rename or reorder its values in Codes…, or choose Swimlanes… to make them another way.`;

/** The source card's three reasons for being shaded (ui-design §4.1), one at a time. */
export const CODE_CARD_LOADING = 'The plan’s activities have not loaded yet.';
export const CODE_CARD_NO_TYPES =
  'This plan has no codes yet. Add them with Codes… in the Activities panel.';
export const CODE_CARD_NONE_ELIGIBLE =
  'No code has between 1 and 100 values in use. Set a code on some activities, or see each code’s reason below.';
export const CODE_CARD_UNREADABLE = 'The plan’s codes could not be read. Close this and try again.';

/** The code card's description; `name` is the code it will use, once one is resolved. */
export const codeCardDescription = (name: string | undefined): string =>
  'One for each value activities carry, named after it, in the order set in Codes…, ' +
  (name === undefined ? 'then the activities with none. ' : `then “No ${name}”. `) +
  `They follow the codes: setting an activity’s ${name ?? 'code'} moves it.`;

/** A switch pressed before the codes have arrived: say so rather than do nothing. */
export const CODE_CHOICE_NOT_READY = 'The codes have not loaded yet. Try again in a moment.';

/** Why a code cannot be chosen (ui-design §4.2); `limit` is `SWIMLANE_LIMIT`. */
export const codeOptionReason = (
  typeName: string,
  valuesInUse: number,
  limit: number,
): string | null =>
  valuesInUse < 1
    ? `No activity carries a value of ${typeName} yet. Set ${typeName} on some activities first.`
    : valuesInUse > limit
      ? `${typeName} has ${String(valuesInUse)} values in use. Swimlanes can show up to ${String(limit)}.`
      : null;

/** An option's trailing annotation: part of its accessible name, so the count is heard with the code. */
export const valuesInUseBadge = (n: number): string =>
  n === 1 ? '1 value in use' : `${String(n)} values in use`;

/** The hint under the picker: who is in "No <type>", summaries included because a P6 file may code them. */
export const codeNoneHint = (typeName: string): string =>
  `Activities with no ${typeName}, and WBS summaries, are in “No ${typeName}”.`;
