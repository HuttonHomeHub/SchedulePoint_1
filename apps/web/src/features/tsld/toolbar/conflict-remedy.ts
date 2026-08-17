/**
 * **Moved to `@/features/plan-actions/conflict-remedy` — this file is a re-export.**
 *
 * It travels with `selection-actions`: ADR-0094 D5 put every conflict's remedy on the object's own
 * surface, so the remedy map is part of the object-action vocabulary rather than of the canvas.
 * Barrel-preserving per ADR-0078 — no consumer's imports change.
 */
export * from '@/features/plan-actions/conflict-remedy';
