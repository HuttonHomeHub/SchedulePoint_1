import { codeBasisOf, codeSwimlaneName } from '@repo/layout';
import type { ActivitySummary } from '@repo/types';

import { codeSwimlaneEditorReason } from '../model/code-swimlane-copy';

import { TextField } from '@/components/ui/form';
import { useCodeTypes, useCodeValues } from '@/features/codes';

/**
 * **The activity editor's Swimlane field while the plan's swimlanes are made from a code**
 * (`m4-ui-design.md` §5.3): the swimlane the activity is in, shown and not editable, with the reason —
 * the `WbsSwimlaneField` shape, for the same reason. It is read-only, not disabled (ADR-0083): the value
 * is the answer to "where is this?", and the sentence says where the way to change it is.
 *
 * The value is read as the diagram reads it (`codeBasisOf` over the type's live values), so the editor
 * and the picture cannot name different swimlanes: a value that has been deleted, or a summary, reads
 * "No <type>". It shows what is saved; an unsaved choice in the Codes section above is not a swimlane
 * until it is saved.
 */
export function CodeSwimlaneField({
  orgSlug,
  planId,
  codeTypeId,
  activity,
}: {
  orgSlug: string;
  planId: string;
  codeTypeId: string;
  activity: ActivitySummary;
}): React.ReactElement {
  const types = useCodeTypes(orgSlug, planId);
  const values = useCodeValues(orgSlug, planId, codeTypeId);
  const typeName = types.data?.find((t) => t.id === codeTypeId)?.name ?? 'a code';
  const live = values.data;
  const valueId =
    live === undefined || activity.type === 'WBS_SUMMARY'
      ? null
      : codeBasisOf(activity.codes, codeTypeId, new Set(live.map((v) => v.id)));
  const found = valueId === null ? undefined : live?.find((v) => v.id === valueId);
  const name =
    found !== undefined
      ? codeSwimlaneName(found)
      : live === undefined && values.isPending
        ? 'Loading…'
        : `No ${typeName === 'a code' ? 'value' : typeName}`;
  return (
    <TextField
      label="Current swimlane"
      value={name}
      gate={{ writable: false, reason: codeSwimlaneEditorReason(typeName) }}
    />
  );
}
