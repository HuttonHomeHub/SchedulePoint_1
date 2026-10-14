import { Fragment } from 'react';

import { ClusterTrack } from './ClusterTrack';
import type { ToolbarClusterSpec } from './toolbar-registry';
import { DECK_RULE_BEFORE } from './toolbar-styles';

import { cn } from '@/lib/utils';

/** What a run needs from a resolved item; `Deck` and `Toolbar` both satisfy it. */
interface RunEntry {
  item: { id: string; presentational?: boolean };
}

/**
 * **One run of a section as an element, keyed by a stable identity — the rule lives here once**
 * (`docs/TECH_DEBT.md` #504). `Deck` and `Toolbar` both map `clusterRuns` through this.
 *
 * A run's key is the item's id (an unclustered run is one item) or the cluster's id. It is never the
 * run's position and never a member that can leave: React keeps positionally keyed siblings by index,
 * so a run appearing earlier, or a cluster's first member being hidden, would re-create the controls
 * after it under the reader, and the focus handoff (ADR-0135) would then announce a control that is
 * still on the bar as gone.
 *
 * `rule` is `Deck`'s `ruleBefore`: `'draw'` paints the inset rule, `'hold'` keeps the same wrapper
 * without it (the run leads its section, where the section or group rule is already in that gap), and
 * `undefined` means the item has none. **The wrapper is the same element in both states** — only its
 * class and attribute change — because swapping a `span` for a bare run changes the element type at
 * one key, and React re-creates what it holds. `contents` gives the held wrapper no box, so it costs
 * the row nothing, exactly as the unwrapped run did.
 */
export function renderRun<T extends RunEntry>(
  run: { cluster: ToolbarClusterSpec | undefined; entries: T[] },
  renderControl: (entry: T) => React.ReactElement,
  rule?: 'draw' | 'hold',
): React.ReactElement | null {
  const first = run.entries[0];
  if (first === undefined) return null;
  const key = run.cluster === undefined ? `item:${first.item.id}` : `cluster:${run.cluster.id}`;
  let body: React.ReactElement;
  if (run.cluster === undefined) {
    body = <>{run.entries.map(renderControl)}</>;
  } else {
    const lead = run.entries.filter((r) => r.item.presentational);
    // A set's caption is presentational and leads the unit; the controls are the track.
    body = (
      <ClusterTrack
        cluster={run.cluster}
        {...(lead.length > 0 ? { lead: lead.map(renderControl) } : {})}
      >
        {run.entries.filter((r) => !r.item.presentational).map(renderControl)}
      </ClusterTrack>
    );
  }
  if (rule === undefined) return <Fragment key={key}>{body}</Fragment>;
  return (
    <span
      key={key}
      {...(rule === 'draw' ? { 'data-deck-rule-before': '' } : {})}
      className={cn(rule === 'draw' ? DECK_RULE_BEFORE : 'contents')}
    >
      {body}
    </span>
  );
}
