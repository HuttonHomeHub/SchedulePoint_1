/**
 * How an import names a record whose name its tier already holds (ADR-0053 §5): the suffix it
 * appends, and the one prefix that finds every variant it could have built earlier. Kept apart from
 * `InterchangeService` because the calendar-reuse lineage rule (ADR-0208) must read the SAME rule
 * rather than restate it — a restated suffix is a lineage check that silently stops matching the day
 * the builder changes.
 */
export const IMPORTED_NAME_SUFFIX = (date: string, ordinal: number): string =>
  ordinal <= 1 ? `(imported ${date})` : `(imported ${date}) (${ordinal})`;

/**
 * The prefix to probe for `name`'s taken variants. A variant clips the base to make room for its
 * suffix, so near the ceiling it no longer starts with the whole name; probing by the base clipped
 * for the longest suffix this importer will build still matches every variant. A shorter prefix only
 * widens the taken set, which is harmless: disambiguation checks exact membership.
 */
export const importedNameProbePrefix = (name: string, maxLength: number): string =>
  name.slice(0, maxLength - IMPORTED_NAME_SUFFIX('0000-00-00', 9999).length - 1).trimEnd();

/** `<base> (imported YYYY-MM-DD)` with an optional ` (<n>)`, split into its parts. */
const VARIANT_SHAPE = /^(.*) \(imported (\d{4}-\d{2}-\d{2})\)(?: \((\d+)\))?$/s;

/**
 * Whether `candidateName` is `sourceName` itself or a variant this importer's disambiguation would
 * have built from it. The check rebuilds the variant with {@link IMPORTED_NAME_SUFFIX} and the same
 * clip, so it accepts exactly what the builder can produce: a clipped base, an ordinal, nothing else.
 * An unrelated name that merely shares the prefix (`Site 6-Day North` against `Site 6-Day`) is not one.
 */
export const isImportedVariantOf = (
  candidateName: string,
  sourceName: string,
  maxLength: number,
): boolean => {
  if (candidateName === sourceName) return true;
  const parts = VARIANT_SHAPE.exec(candidateName);
  if (parts === null) return false;
  const [, base, date, ordinal] = parts;
  if (base === undefined || date === undefined) return false;
  const n = ordinal === undefined ? 1 : Number(ordinal);
  // The builder only emits an ordinal from 2 up; `(1)` would be a hand-typed lookalike.
  if (ordinal !== undefined && n < 2) return false;
  const suffix = IMPORTED_NAME_SUFFIX(date, n);
  const room = maxLength - suffix.length - 1;
  const expectedBase = room > 0 ? sourceName.slice(0, room).trimEnd() : '';
  return base === expectedBase;
};

/**
 * The first free variant of `name` in `taken`: the name itself, else `"<name> (imported <date>)"`,
 * else the same with an incrementing ordinal. Each candidate is clipped to `maxLength` (the suffix is
 * preserved — it is what makes the name unique — so the BASE is what gives way). `null` only if no
 * variant is free, which the bound below makes unreachable; the caller decides how loudly to fail.
 */
export const firstFreeImportedName = (
  name: string,
  taken: ReadonlySet<string>,
  today: string,
  maxLength: number,
): string | null => {
  if (!taken.has(name)) return name;
  // One attempt per already-taken name, plus one — so a free variant is always reachable.
  for (let ordinal = 1; ordinal <= taken.size + 1; ordinal += 1) {
    const suffix = IMPORTED_NAME_SUFFIX(today, ordinal);
    const room = maxLength - suffix.length - 1;
    const base = room > 0 ? name.slice(0, room).trimEnd() : '';
    const candidate = base.length > 0 ? `${base} ${suffix}` : suffix;
    if (!taken.has(candidate)) return candidate;
  }
  return null;
};
