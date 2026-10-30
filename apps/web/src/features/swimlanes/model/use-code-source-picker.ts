import type { ActivitySummary } from '@repo/types';
import { useMemo, useState } from 'react';

import { codeSourceChoices, resolveCodeChoice, type CodeSourceChoice } from './code-source-choices';
import {
  CODE_CARD_LOADING,
  CODE_CARD_NONE_ELIGIBLE,
  CODE_CARD_NO_TYPES,
  CODE_CARD_UNREADABLE,
} from './code-swimlane-copy';

import { useCodeTypes, useCodeValues } from '@/features/codes';

/** What the "One per code value" choice holds, for {@link SwimlaneSourceFields}. */
export interface CodeSourcePicker {
  /** Why the card is shaded, or `null`. Claimed only once the answer is known (never while loading). */
  cardReason: string | null;
  /** The types with their counts and reasons; `undefined` until both the types and the activities are known. */
  choices: readonly CodeSourceChoice[] | undefined;
  /** The type being offered: the planner's pick, else the plan's own, else the first that can be chosen. */
  typeId: string | null;
  onType: (typeId: string) => void;
  /** The types are on their way: the picker shows its loading row rather than "no matches". */
  loading: boolean;
  errored: boolean;
}

/**
 * The reads and the one piece of state behind the code card, shared by the setup and manage dialogs so
 * the two cannot offer different types. Called inside a dialog's form, which `Dialog` mounts only while
 * open, so the types are read only for a planner who opened one.
 *
 * Counts come from the activity list the workspace already holds (no request). Choosing the card
 * prefetches the type's values, so by the time the source write lands the names are cached and the
 * diagram regroups in one frame (ADR-0202).
 */
export function useCodeSourcePicker(args: {
  orgSlug: string;
  planId: string;
  activities: readonly ActivitySummary[] | undefined;
  /** The type the plan is drawn by now, or `null`. */
  current: string | null;
  /** The code card is the chosen one: the type's values are worth fetching. */
  chosen: boolean;
}): CodeSourcePicker {
  const { orgSlug, planId, activities, current, chosen } = args;
  const types = useCodeTypes(orgSlug, planId);
  const [picked, setPicked] = useState<string | null>(null);
  const typeData = types.data;
  const choices = useMemo(
    () =>
      typeData === undefined || activities === undefined
        ? undefined
        : codeSourceChoices(typeData, activities),
    [typeData, activities],
  );
  const typeId = choices === undefined ? null : resolveCodeChoice(choices, picked, current);
  useCodeValues(orgSlug, planId, typeId ?? undefined, chosen && typeId !== null);

  let cardReason: string | null = null;
  if (activities === undefined) cardReason = CODE_CARD_LOADING;
  else if (types.isError) cardReason = CODE_CARD_UNREADABLE;
  else if (typeData !== undefined) {
    if (typeData.length === 0) cardReason = CODE_CARD_NO_TYPES;
    else if (choices?.every((c) => c.reason !== null)) cardReason = CODE_CARD_NONE_ELIGIBLE;
  }
  return {
    cardReason,
    choices,
    typeId,
    onType: setPicked,
    loading: types.isPending,
    errored: types.isError,
  };
}
