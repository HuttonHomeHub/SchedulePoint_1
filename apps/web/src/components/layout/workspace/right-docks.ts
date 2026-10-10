/**
 * **The right edge holds one dock at a time** (audit F4), expressed as a SET rather than as pairs
 * (health M2-T2 step 7). With two docks the rule was two statements; a third participant needs six,
 * and the way that fails is that five get written, one pair is missed, two docks open together, and
 * the diagram is crushed on exactly the narrow screen the invariant exists to protect. So the rule
 * is one derivation over the member list: opening any dock closes every other member, and adding a
 * dock means adding one name here — the closures cannot be five-sixths written. (The set was
 * three when that was written; the revision comparison made it four without touching this
 * function, which is the argument working rather than a sentence needing a footnote.)
 *
 * The workspace (which lays the docks out) maps each name to its closer once; neither feature
 * knows about a column it does not render.
 */
export const RIGHT_DOCKS = ['notes', 'floatPaths', 'health', 'revisions'] as const;

export type RightDock = (typeof RIGHT_DOCKS)[number];

/** Every OTHER member of the set — the docks that must close when `opening` opens. */
export function docksToClose(opening: RightDock): readonly RightDock[] {
  return RIGHT_DOCKS.filter((dock) => dock !== opening);
}

/**
 * The toolbar controls (`data-toolbar-item`) a dock is opened from, **most specific first**, which is
 * where focus goes when a dock closes while it holds focus. A `Record` over the set, so a fifth dock
 * cannot be added without naming its trigger.
 *
 * Health check and Compare revisions are menu rows of `Analysis` and, while the viewport has room,
 * toggles of their own on the bar (toolbar-redesign M5). The toggle is the control the reader pressed,
 * so it comes first; `Analysis` is on the bar at every width and is the fallback, which is what keeps
 * a narrowed window from stranding focus. The first one in the document takes it.
 */
export const DOCK_TRIGGER_ITEMS: Record<RightDock, readonly string[]> = {
  notes: ['comments'],
  floatPaths: ['float-paths'],
  health: ['health-check', 'analysis'],
  revisions: ['compare-revisions', 'analysis'],
};

/** Focus the first of a dock's trigger controls that is on the page. Returns whether one took it. */
export function focusDockTrigger(dock: RightDock): boolean {
  for (const item of DOCK_TRIGGER_ITEMS[dock]) {
    const el = document.querySelector<HTMLElement>(`[data-toolbar-item="${item}"]`);
    if (el) {
      el.focus();
      return true;
    }
  }
  return false;
}
