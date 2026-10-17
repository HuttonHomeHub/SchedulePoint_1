import type { DeletedItem } from '@repo/types';

import { ApiFetchError } from '@/lib/api/client';

/** Where a refused restore points the reader, if anywhere. */
export type RestoreFailureLibrary = 'resources' | 'calendars';

export interface RestoreFailure {
  /** The sentence to show: the server's when it is already actionable, ours when it is not. */
  message: string;
  /** Set when the cure is to rename something in a library, so the alert can link there. */
  library: RestoreFailureLibrary | null;
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null;

/**
 * What a refused restore says (ADR-0195).
 *
 * Most refusals already carry a sentence that names the cause and the cure — "A resource named
 * “Crane A” already exists. Rename or delete that one, then restore this." — so those pass through
 * untouched and only gain a link to the library where the rename happens. Two do not, and are worded
 * here because the server's text is a rule and the reader needs a name:
 *
 * - **A 404 means gone, not unlucky** (`docs/API.md`, the retention race): the item no longer exists
 *   and retrying cannot help, which "Resource not found." does not say.
 * - **A parent that has stopped being a group, or sits too deep**, which the server sends with the
 *   parent's name in `details` rather than in the sentence.
 */
export function describeRestoreFailure(error: Error, kind: DeletedItem['kind']): RestoreFailure {
  if (!(error instanceof ApiFetchError)) return { message: error.message, library: null };
  if (error.status === 404) return { message: 'This item no longer exists.', library: null };

  const details = isRecord(error.error.details) ? error.error.details : {};
  const reason = typeof details.reason === 'string' ? details.reason : null;
  const parent = typeof details.parentName === 'string' ? `“${details.parentName}”` : 'the group';

  if (reason === 'RESOURCE_PARENT_NOT_GROUP') {
    return {
      message: `${parent} is no longer a resource group, so this can’t go back inside it. Change it back to a group or move it, then restore this.`,
      library: null,
    };
  }
  if (reason === 'RESOURCE_TREE_TOO_DEEP') {
    const depth = typeof details.resultingDepth === 'number' ? details.resultingDepth : null;
    const max = typeof details.maxDepth === 'number' ? details.maxDepth : null;
    const levels =
      depth !== null && max !== null
        ? ` (it would reach ${depth} levels; the limit is ${max})`
        : '';
    return {
      message: `${parent} is nested too deeply to hold this${levels}. Move that group nearer the top, then restore this.`,
      library: null,
    };
  }
  const clash = reason === 'NAME_TAKEN' || reason === 'CODE_TAKEN';
  const library: RestoreFailureLibrary | null =
    clash && kind === 'resource' ? 'resources' : clash && kind === 'calendar' ? 'calendars' : null;
  return { message: error.message, library };
}
