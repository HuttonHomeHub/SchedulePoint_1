import type { DeletedItem, DeletedItemBlocker } from '@repo/types';

/**
 * What a deleted row is called, in one place, because the table, the confirmation dialog and the
 * announcements all say it and used to keep three copies of a three-entry map (ADR-0195).
 *
 * The wording depends on `subtype` as well as `kind` — a resource group is not "a resource" to a
 * reader, and an organisation calendar is not a project's — but `subtype` is for DISPLAY only. It
 * never decides what a button does or whether one is shown.
 */

/**
 * `empty` is true for a resource GROUP whose deletion took nothing else with it (Q3, ADR-0195): a
 * dissolved group, or a group whose members were all deleted earlier. The API cannot say so on the
 * row — a dissolve and a delete are the same soft delete — so the caller derives it from the
 * deletion group it already holds (`members.length === 0`). It is wording only: it says what a
 * restore brings back (an empty group), and never decides whether one is offered.
 */
type Labelled = Pick<DeletedItem, 'kind' | 'subtype'> & { empty?: boolean };

/** The Type column and the rows listed in a confirmation: "Resource group", "Calendar (project)". */
export function typeLabel({ kind, subtype, empty }: Labelled): string {
  switch (kind) {
    case 'client':
      return 'Client';
    case 'project':
      return 'Project';
    case 'plan':
      return 'Plan';
    case 'resource':
      if (subtype !== 'GROUP') return 'Resource';
      return empty === true ? 'Empty resource group' : 'Resource group';
    case 'calendar':
      return subtype === 'PROJECT' ? 'Calendar (project)' : 'Calendar (organisation)';
  }
}

/** The noun inside a sentence, lower case: "restore resource group Groundworks". */
export function nounOf({ kind, subtype, empty }: Labelled): string {
  switch (kind) {
    case 'resource':
      if (subtype !== 'GROUP') return 'resource';
      return empty === true ? 'empty resource group' : 'resource group';
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
