import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

/**
 * Merge class names with Tailwind-aware conflict resolution. The single helper
 * every component uses to compose `className`s (docs/DESIGN_SYSTEM.md).
 */
export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs));
}
