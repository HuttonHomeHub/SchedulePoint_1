import type { Tally } from './classify';

export type LimbName = 'reload' | 'revisit' | 'network';

/**
 * One of the three readings a press takes.
 *
 * **A limb is "taken", "incomplete" or "not taken", and only the first is a reading.** A navigation
 * of the wrong type measures something else (a `navigate` is not a reload), and a truncated timing
 * buffer misses files; reporting either as a number would be reporting it as fast.
 */
export type Limb =
  | {
      readonly name: LimbName;
      readonly status: 'taken';
      readonly tally: Tally;
      /** From asking for the plan screen's code to every file being evaluated, in milliseconds. */
      readonly readyMs: number;
      readonly note?: string;
    }
  | {
      readonly name: LimbName;
      readonly status: 'incomplete';
      readonly tally: Tally;
      readonly readyMs: number;
      readonly reason: string;
    }
  | { readonly name: LimbName; readonly status: 'not-taken'; readonly reason: string };

export type CacheControlReading =
  | { readonly status: 'read'; readonly value: string | null; readonly url: string }
  | { readonly status: 'failed'; readonly reason: string };

export interface LoadingReading {
  readonly takenAt: string;
  readonly development: boolean;
  readonly browser: string;
  readonly webVersion: string;
  /** Null while the installation query has not answered; the block says so rather than guessing. */
  readonly apiVersion: string | null;
  readonly reload: Limb;
  readonly revisit: Limb;
  readonly network: Limb;
  readonly cacheControl: CacheControlReading;
}
