import type { ResourceCollision, ResourceCollisionResolution } from '@repo/interchange';

/**
 * A library resource that could match one of the file's; `archivedAt` rides along for the unarchive,
 * and `calendarId` for the decision to leave out the file's copy of that calendar (ADR-0208 D7).
 */
export interface LibraryResource {
  readonly id: string;
  readonly code: string | null;
  readonly name: string;
  readonly archivedAt: Date | null;
  readonly calendarId: string | null;
}

/** What the matcher reads of a source resource. */
export interface SourceResource {
  readonly key: string;
  readonly name: string;
  readonly code: string | null;
}

/**
 * What the import does with one source resource.
 *
 * - `insert` — a new row. `copy` is true when the library already held the name and the planner
 *   answered `CREATE_COPY`, so the row is created under a free copy name.
 * - `match` — no new row. `via` says why: `code` (the library holds that code), `answer` (the
 *   planner chose `REUSE_EXISTING` for a library name), or `file` (an earlier source row of THIS file
 *   already decided about that code or name; `fileKey` names it and its decision is the target).
 *   `libraryId` is set for `code` and `answer`.
 */
export type ResourceDecision =
  | { readonly kind: 'insert'; readonly copy: boolean }
  | {
      readonly kind: 'match';
      readonly via: 'code' | 'answer' | 'file';
      readonly libraryId?: string;
      readonly fileKey?: string;
    };

export interface ResourceMatch {
  /** One entry per source resource, in source order. */
  readonly decisions: ReadonlyMap<string, ResourceDecision>;
  /** Every genuine name collision with the library, answered or not. */
  readonly collisions: ResourceCollision[];
  /** The collisions `resolutions` has no answer for. */
  readonly unresolved: ResourceCollision[];
  /** Matched archived library rows, each once, in the order the file first reached them. */
  readonly unarchive: LibraryResource[];
}

/**
 * Given the library rows that could possibly match, which source rows are genuinely ambiguous. The
 * dry-run and the commit both reach it, so the set of questions the dry-run asks and the set the
 * commit demands answers for cannot drift apart. (Two implementations of "is this a collision" would
 * disagree in exactly one place: a commit refusing a resolution the planner was never shown.)
 */
export function findResourceCollisions(
  resources: readonly SourceResource[],
  library: readonly LibraryResource[],
): ResourceCollision[] {
  const byCode = new Map(
    library.filter((r) => r.code !== null).map((r) => [r.code as string, r] as const),
  );
  const byName = new Map(library.map((r) => [r.name, r] as const));

  const collisions: ResourceCollision[] = [];
  // Names claimed by earlier source rows in THIS file, so two source resources sharing a name do not
  // both report a collision against the library and then collide with each other on insert.
  // `matchImportResources` mirrors this with `resolvedKeyByName`.
  const claimed = new Set<string>();
  for (const resource of resources) {
    if (resource.code !== null && byCode.has(resource.code)) {
      claimed.add(resource.name); // identity match — no question, but the name is now spoken for
      continue;
    }
    if (claimed.has(resource.name)) continue; // this file already decided about this name
    claimed.add(resource.name);
    const clash = byName.get(resource.name);
    if (clash === undefined) continue;
    collisions.push({
      resourceKey: resource.key,
      name: resource.name,
      code: resource.code,
      existing: {
        id: clash.id,
        name: clash.name,
        code: clash.code,
        archived: clash.archivedAt !== null,
      },
    });
  }
  return collisions;
}

/**
 * Decide, for each resource in the file, whether the import inserts it or matches it to a row that
 * already exists — in the library, or earlier in the same file. No I/O: the commit reads the library
 * once, hands it here, and mints ids afterwards.
 *
 * The walk is in source order and order matters: a later row's code is matched against what EARLIER
 * rows of the file decided before the library is consulted, and a name this file has already decided
 * about is the same source crew appearing twice and needs no second question. A library NAME match is
 * the ambiguous case and is decided by `resolutions`.
 */
export function matchImportResources(
  graph: { readonly resources: readonly SourceResource[] },
  library: readonly LibraryResource[],
  resolutions: Readonly<Record<string, ResourceCollisionResolution>>,
): ResourceMatch {
  const libraryByCode = new Map<string, LibraryResource>();
  const libraryByName = new Map<string, LibraryResource>();
  for (const r of library) {
    if (r.code !== null) libraryByCode.set(r.code, r);
    libraryByName.set(r.name, r);
  }
  // Source key of the row that last decided about a code / name in this file; its decision is the target.
  const resolvedKeyByCode = new Map<string, string>();
  const resolvedKeyByName = new Map<string, string>();
  // An archived row is still an active row (archive is orthogonal to soft delete, ADR-0053 §4), so it
  // matches; each is reported once however many source rows reach it.
  const archivedById = new Map(library.filter((r) => r.archivedAt !== null).map((r) => [r.id, r]));
  const unarchive: LibraryResource[] = [];
  const claimLibraryRow = (id: string): void => {
    const archived = archivedById.get(id);
    if (archived === undefined) return;
    archivedById.delete(id);
    unarchive.push(archived);
  };

  const collisions = findResourceCollisions(graph.resources, library);
  const unresolved = collisions.filter((c) => resolutions[c.resourceKey] === undefined);

  const decisions = new Map<string, ResourceDecision>();
  for (const resource of graph.resources) {
    // (a) CODE IS IDENTITY — a row this file already decided about, else the library.
    const fileCodeKey = resource.code !== null ? resolvedKeyByCode.get(resource.code) : undefined;
    const libraryCode = resource.code !== null ? libraryByCode.get(resource.code) : undefined;
    // (b) A name this file already decided about: the same source crew appearing twice.
    const fileNameKey = resolvedKeyByName.get(resource.name);

    let decision: ResourceDecision;
    if (fileCodeKey !== undefined) {
      decision = { kind: 'match', via: 'file', fileKey: fileCodeKey };
    } else if (libraryCode !== undefined) {
      decision = { kind: 'match', via: 'code', libraryId: libraryCode.id };
      claimLibraryRow(libraryCode.id);
    } else if (fileNameKey !== undefined) {
      decision = { kind: 'match', via: 'file', fileKey: fileNameKey };
    } else {
      // (c) The library holds this name and nothing identified the row: the planner's answer decides.
      const libraryName = libraryByName.get(resource.name);
      if (libraryName !== undefined && resolutions[resource.key] === 'REUSE_EXISTING') {
        decision = { kind: 'match', via: 'answer', libraryId: libraryName.id };
        claimLibraryRow(libraryName.id);
      } else {
        decision = { kind: 'insert', copy: libraryName !== undefined };
      }
    }

    decisions.set(resource.key, decision);
    if (resource.code !== null) resolvedKeyByCode.set(resource.code, resource.key);
    resolvedKeyByName.set(resource.name, resource.key);
  }

  return { decisions, collisions, unresolved, unarchive };
}
