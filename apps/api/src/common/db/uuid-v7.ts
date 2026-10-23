import { randomBytes } from 'node:crypto';

/**
 * A UUID v7 for a raw insert (house primary-key convention: time-ordered, so the key index appends).
 * Prisma mints these itself for a model `create`; a raw statement has to bring its own. The
 * timestamp is the row's own time, so the key orders with the row.
 */
export function uuidV7(at: Date): string {
  const b = randomBytes(16);
  b.writeUIntBE(at.getTime(), 0, 6);
  b[6] = (b[6]! & 0x0f) | 0x70;
  b[8] = (b[8]! & 0x3f) | 0x80;
  const h = b.toString('hex');
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`;
}
