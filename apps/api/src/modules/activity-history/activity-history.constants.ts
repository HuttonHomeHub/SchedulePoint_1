/**
 * The merge rule's numbers (ADR-0174 D2), each with its reason (ADR-0151: a constant carries its
 * justification). **Server constants, not schema**: changing one affects only entries written after
 * the change and needs no migration.
 */

/**
 * A write joins the activity's latest entry only if that entry was last touched within this long.
 *
 * 60 s joins "drag, look, drag again" — the sequence a person makes while fiddling, whose saves
 * arrive seconds apart. The client already squeezes a held arrow key into one request per 150 ms
 * pause (`use-coalesced-nudge.ts`), so the server does not have to absorb key-repeat; it only has to
 * join deliberate re-saves. Unmeasured against real usage until the history has real volume
 * (plan M3-T2).
 */
export const MERGE_QUIET_GAP_MS = 60_000;

/**
 * …and only if that entry was first recorded within this long, so an afternoon of nudging one bar
 * is several entries and not one entry that hides three hours. 10 minutes is a working session's
 * natural unit of "one go at it".
 */
export const MERGE_MAX_SPAN_MS = 600_000;

/**
 * The most keyed-object items (`link:` / `xlink:` / `assignment:`) one entry carries.
 *
 * It is what keeps `ck_activity_history_changes_size` (32 KiB) honest: the worst keyed item is an
 * assignment with a 200-character name and a 32-character code in 4-byte UTF-8, about 1.5 KB, and
 * 5 KB of field items plus 16 of them is about 29 KB (data-model §2 "Bound"). A merge that would
 * take an entry past the cap inserts a new entry instead — merging is an optimisation, so declining
 * one loses nothing. A single-object write produces at most two keyed items for one activity (a
 * link; or an assignment plus the driver it displaced), so no single-object write can exceed it on
 * its own. A knock-on on a hub activity can, and the batch recorder then splits it into entries of at
 * most this many sharing the write's batch id (`chunkChanges`) rather than refusing the delete or
 * restore that caused it.
 */
export const MAX_KEYED_ITEMS_PER_ENTRY = 16;
