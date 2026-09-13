/**
 * Why a reading's write failed, and whether pressing the button again could ever help.
 *
 * **The panel used to say one sentence for every failure** — _"These figures were measured but NOT
 * recorded."_ — beside a **Retry recording** button (`docs/TECH_DEBT.md` #269). That copy is right
 * for the case it was written for: a dropped socket or a 500, where pressing the button is exactly
 * what an operator should do.
 *
 * It is wrong for most 4xx. A 422 means the server refuses this body, so the same body will be
 * refused again — the panel was inviting an operator to press a button that cannot work, and saying
 * nothing that let them tell the two situations apart.
 *
 * **That is not hypothetical; it is how a real defect stayed invisible.** Every `revision-diff`
 * reading had been answered `422 … property frames should not exist` since that scenario shipped,
 * and the panel reported it in the same words it uses for a network blip. The diagnosis came from a
 * journey reading the response body, never from anything on screen. Removing that 422 did not
 * remove this: the next one will look identical.
 */

import { RETRYABLE_4XX, isRetryableStatus, readErrorStatus } from '@/lib/api/retryable-status';

/** What the panel needs to know about a failed write. Derived once, never re-derived at a call site. */
export interface StoreFailure {
  /** The HTTP status, or `null` when the request never got an answer (a dropped socket, offline). */
  readonly status: number | null;
  /** Whether pressing **Retry recording** could plausibly succeed with the SAME body. */
  readonly retryable: boolean;
  /** One sentence naming what happened, for the operator. Always present. */
  readonly summary: string;
  /**
   * Why a retry cannot help, for the shaded control's `aria-describedby`.
   *
   * `null` exactly when `retryable` — a reason beside a live button would be a refusal that is not
   * happening (ADR-0082).
   */
  readonly retryBlockedReason: string | null;
}

/**
 * **Which statuses are retryable is a DECISION, and `#269` says so** — it is the reason that row
 * exists rather than being a fast-follow. It now lives in `lib/api/retryable-status.ts`, because
 * it turned out to be the APP's rule and not this panel's: `lib/query/query-client.ts` had shipped
 * the opposite answer under a docblock asserting 4xx are never transient (`docs/TECH_DEBT.md`
 * #314). Read the statuses and their reasons there; this file is the panel's copy layer over it.
 */
export function describeStoreFailure(error: unknown): StoreFailure {
  const status = readErrorStatus(error);
  // Derived ONCE from the shared rule rather than written as a literal in each branch below: the
  // branches exist to choose the operator's sentence, and a literal per branch is how the copy and
  // the behaviour drift apart without anything failing.
  const retryable = isRetryableStatus(status);

  if (status === null) {
    return {
      status: null,
      retryable,
      summary:
        'These figures were measured but NOT recorded — the request never reached the server.',
      retryBlockedReason: null,
    };
  }

  if (status >= 500) {
    return {
      status,
      retryable,
      summary: `These figures were measured but NOT recorded — the server answered ${String(status)}.`,
      retryBlockedReason: null,
    };
  }

  if (status === 429) {
    return {
      status,
      retryable,
      summary:
        'These figures were measured but NOT recorded — the server is rate limiting this console. ' +
        'Waiting a moment and retrying should work.',
      retryBlockedReason: null,
    };
  }

  if (RETRYABLE_4XX.has(status)) {
    return {
      status,
      retryable,
      summary: `These figures were measured but NOT recorded — the request timed out (${String(status)}).`,
      retryBlockedReason: null,
    };
  }

  if (status >= 400) {
    return {
      status,
      retryable,
      summary:
        `These figures were measured but NOT recorded — the server refused this reading ` +
        `(${String(status)}). Retrying would send the same reading and be refused again, so the ` +
        `figures below are all that survives this run. This is a defect worth reporting.`,
      retryBlockedReason:
        `Retrying cannot help: the server refused this reading with ${String(status)}, and a retry ` +
        `sends exactly the same reading.`,
    };
  }

  return {
    status,
    retryable,
    summary: `These figures were measured but NOT recorded — the server answered ${String(status)}.`,
    retryBlockedReason: null,
  };
}
