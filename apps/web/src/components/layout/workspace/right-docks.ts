/**
 * **The right edge holds one dock at a time** (audit F4), expressed as a SET rather than as pairs
 * (health M2-T2 step 7). With two docks the rule was two statements; a third participant needs six,
 * and the way that fails is that five get written, one pair is missed, two docks open together, and
 * the diagram is crushed on exactly the narrow screen the invariant exists to protect. So the rule
 * is one derivation over the member list: opening any dock closes every other member, and adding a
 * fourth dock means adding one name here — the closures cannot be five-sixths written.
 *
 * The workspace (which lays the docks out) maps each name to its closer once; neither feature
 * knows about a column it does not render.
 */
export const RIGHT_DOCKS = ['notes', 'floatPaths', 'health'] as const;

export type RightDock = (typeof RIGHT_DOCKS)[number];

/** Every OTHER member of the set — the docks that must close when `opening` opens. */
export function docksToClose(opening: RightDock): readonly RightDock[] {
  return RIGHT_DOCKS.filter((dock) => dock !== opening);
}
