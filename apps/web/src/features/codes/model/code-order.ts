/**
 * The list with one row moved a place up (`-1`) or down (`1`), or `null` when it is already at that
 * end or is not in the list. Pure, so the dialog's buttons and the undo command agree on what
 * "move up" means. Works for types and for values: both are an ordered list of rows with an id.
 */
export function movedRow<T extends { id: string }>(
  list: readonly T[],
  id: string,
  delta: -1 | 1,
): T[] | null {
  const from = list.findIndex((row) => row.id === id);
  const to = from + delta;
  if (from < 0 || to < 0 || to >= list.length) return null;
  const next = [...list];
  const [moved] = next.splice(from, 1);
  if (moved === undefined) return null;
  next.splice(to, 0, moved);
  return next;
}

/**
 * The body a reorder names: **every** live row once, with the version it was read at. This is why a
 * type's values are always loaded whole before they can be moved (`docs/API.md` "Codes").
 */
export function orderBody(
  list: readonly { id: string; version: number }[],
): { id: string; version: number }[] {
  return list.map((row) => ({ id: row.id, version: row.version }));
}
