import type { ToolbarClusterSpec } from './toolbar-registry';
import { TOOLBAR_TRACK, TOOLBAR_TRACK_SWITCH } from './toolbar-styles';

import { cn } from '@/lib/utils';

export interface ClusterTrackProps {
  cluster: ToolbarClusterSpec;
  /**
   * Presentational members of the run (a set's caption), drawn before the track and kept on its line:
   * the unit does not wrap, so "Colour" never ends one line while its three values start the next.
   */
  lead?: React.ReactNode;
  children: React.ReactNode;
}

/**
 * **The wrapper a cluster renders** (toolbar-grid M2), shared by `Deck` and `Toolbar` so the two
 * cannot paint a track differently.
 *
 * It is a plain `<span>`: **no role, no accessible name, no `tabindex` and no `data-toolbar-focusable`**.
 * The roving walk queries `[data-toolbar-focusable]` in document order, so wrapping members changes
 * neither the stops nor their order, and the group names are the assistive structure they were. A
 * `role="group"` here would announce a fact with no words, which is the argument `Deck` makes about its
 * row wrappers; `deck-seams.structural.test.tsx` pins the invariant. (The header's `Diagram | Gantt`
 * wrapper is a different thing: it is a named `group` made by `Toolbar`'s segments, and it keeps both.)
 *
 * `data-toolbar-cluster` is the test and CSS handle; `max-lg:shrink-0` is the rule every deck box
 * follows on the scrolling line below `lg`.
 */
export function ClusterTrack({ cluster, lead, children }: ClusterTrackProps): React.ReactElement {
  const track = (
    <span
      data-toolbar-cluster={cluster.id}
      data-toolbar-cluster-kind={cluster.kind}
      className={cn(
        TOOLBAR_TRACK,
        cluster.kind === 'switch' && TOOLBAR_TRACK_SWITCH,
        'max-lg:shrink-0',
      )}
    >
      {children}
    </span>
  );
  if (lead === undefined) return track;
  return (
    <span className="inline-flex flex-nowrap items-center gap-1 max-lg:shrink-0">
      {lead}
      {track}
    </span>
  );
}
