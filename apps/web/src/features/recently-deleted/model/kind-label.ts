import type { DeletedItem, DeletedItemBlocker } from '@repo/types';

/**
 * What a deleted row is called, in one place, because the table, the confirmation dialog and the
 * announcements all say it and used to keep three copies of a three-entry map (ADR-0195).
 *
 * The wording depends on `subtype` as well as `kind` — a resource group is not "a resource" to a
 * reader, and an organisation calendar is not a project's — but `subtype` is for DISPLAY only. It
 * never decides what a button does or whether one is shown.
 */

type Labelled = Pick<DeletedItem, 'kind' | 'subtype'>;

/** The Type column and the rows listed in a confirmation: "Resource group", "Calendar (project)". */
export function typeLabel({ kind, subtype }: Labelled): string {
  switch (kind) {
    case 'client':
      return 'Client';
    case 'project':
      return 'Project';
    case 'plan':
      return 'Plan';
    case 'resource':
      return subtype === 'GROUP' ? 'Resource group' : 'Resource';
    case 'calendar':
      return subtype === 'PROJECT' ? 'Calendar (project)' : 'Calendar (organisation)';
  }
}

/** The noun inside a sentence, lower case: "restore resource group Groundworks". */
export function nounOf({ kind, subtype }: Labelled): string {
  switch (kind) {
    case 'resource':
      return subtype === 'GROUP' ? 'resource group' : 'resource';
    default:
      // The tier is a column's job; a sentence about one calendar just says "calendar".
      return kind;
  }
}

/** The same noun, sentence case, for a message that starts with it. */
export function sentenceNounOf(item: Labelled): string {
  const noun = nounOf(item);
  return `${noun.charAt(0).toUpperCase()}${noun.slice(1)}`;
}

/**
 * What a BLOCKER is called. A blocker carries no `subtype`, but it needs none: the only resource that
 * can block anything is a group (a leaf has no children), and the only calendar that can block a
 * restore is the one a resource uses.
 */
export function blockerNoun(kind: DeletedItemBlocker['kind']): string {
  return kind === 'resource' ? 'resource group' : kind;
}
