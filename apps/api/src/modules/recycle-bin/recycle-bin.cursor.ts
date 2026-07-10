import type { DeletedCursor, DeletedRow } from './recycle-bin.repository';

/**
 * Opaque keyset cursor for the merged deleted stream. Encodes the last row's
 * `(deletedAt, id)` — an ISO timestamp and a uuid — as base64url (see
 * docs/API.md: cursors are opaque to clients).
 */
export function encodeDeletedCursor(row: Pick<DeletedRow, 'deletedAt' | 'id'>): string {
  return Buffer.from(`${row.deletedAt.toISOString()}|${row.id}`, 'utf8').toString('base64url');
}

/**
 * Decode a cursor produced by {@link encodeDeletedCursor}. Returns `undefined`
 * for anything malformed so a bad cursor degrades to the first page rather than
 * throwing — the values are never trusted for scope (org-scoping is separate).
 */
export function decodeDeletedCursor(raw: string): DeletedCursor | undefined {
  let decoded: string;
  try {
    decoded = Buffer.from(raw, 'base64url').toString('utf8');
  } catch {
    return undefined;
  }
  const sep = decoded.lastIndexOf('|');
  if (sep <= 0) return undefined;
  const iso = decoded.slice(0, sep);
  const id = decoded.slice(sep + 1);
  if (!id) return undefined;
  const deletedAt = new Date(iso);
  if (Number.isNaN(deletedAt.getTime())) return undefined;
  return { deletedAt, id };
}
