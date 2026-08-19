import type { OverviewActor } from '@repo/types';

/**
 * Who did it — rendering the three cases as three different sentences.
 *
 * The API sends a discriminated union rather than a nullable name precisely so this component can
 * tell "somebody who has left" from "we do not know". Collapsing them here would throw away the
 * distinction the endpoint was shaped to preserve — and the difference matters to the reader: one
 * says the change is unattributable, the other says the person is gone but the change was theirs.
 *
 * The strings are the spec's (§2 acceptance criteria for US-1) and are capitalised because they sit
 * where a person's name sits, not inside a sentence.
 *
 * All three cases return ONE element rather than the member case returning a bare fragment: a row
 * that changes DOM shape depending on whether the actor is known is a difference with no reason
 * behind it, and the two non-member cases already needed a wrapper for their emphasis.
 */
export function ActorName({ actor }: { actor: OverviewActor }): React.ReactElement {
  if (actor.kind === 'MEMBER') return <span>{actor.name}</span>;
  if (actor.kind === 'FORMER_MEMBER') return <span className="italic">A former member</span>;
  return <span className="italic">Unknown</span>;
}
