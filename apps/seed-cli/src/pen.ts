import type { SeedClient } from './client.js';

/**
 * Holds the ADR-0028 **plan edit-lock** ("the pen") for the duration of a seed run.
 *
 * Structural writes — creating activities, linking them, assigning resources — are gated on
 * `assertHoldsPen` and answer 423 without it. The seeder therefore takes the lease like any other
 * client rather than being given a way round it, which is the ADR-0066 rule: if the seeder needs a
 * privileged path, the thing it is testing is no longer the product.
 *
 * The lease expires, so it must be heartbeated. A **leaked** lease is the failure worth designing
 * against: it blocks the plan for the whole TTL and nothing announces it, so `release()` runs from a
 * `finally` on every path including the failure path.
 */
export class PenHolder {
  private timer: NodeJS.Timeout | null = null;

  private constructor(
    private readonly client: SeedClient,
    private readonly orgSlug: string,
    private readonly planId: string,
  ) {}

  /**
   * Take the lease and start heartbeating. A 423 here means **someone else holds it** — the seeder
   * deliberately does not take over, because an operator seeding over a colleague's live edit is not
   * a default worth having (an Org Admin override exists in the product; using it unprompted from a
   * script is not the same thing).
   */
  static async acquire(
    client: SeedClient,
    orgSlug: string,
    planId: string,
    heartbeatMs = 20_000,
  ): Promise<PenHolder> {
    const holder = new PenHolder(client, orgSlug, planId);
    await client.post(holder.path(), {});
    holder.timer = setInterval(() => {
      // A failed heartbeat is not fatal on its own — the next structural write will 423 and say so
      // far more precisely than a timer could. Swallowing it here keeps one transient blip from
      // killing a run that is otherwise fine.
      void client.post(`${holder.path()}/heartbeat`, {}).catch(() => undefined);
    }, heartbeatMs);
    holder.timer.unref?.();
    return holder;
  }

  /** Release the lease and stop heartbeating. Safe to call twice. */
  async release(): Promise<void> {
    if (this.timer !== null) {
      clearInterval(this.timer);
      this.timer = null;
    }
    // A failed release is worth ignoring rather than masking the error that led here: if the run is
    // already unwinding from a real failure, a secondary 404 on the lock must not replace it.
    await this.client.del(this.path()).catch(() => undefined);
  }

  /** Run `work` with the pen held, releasing it on every path — including a throw. */
  static async withPen<T>(
    client: SeedClient,
    orgSlug: string,
    planId: string,
    work: () => Promise<T>,
  ): Promise<T> {
    const pen = await PenHolder.acquire(client, orgSlug, planId);
    try {
      return await work();
    } finally {
      await pen.release();
    }
  }

  private path(): string {
    return `/api/v1/organizations/${this.orgSlug}/plans/${this.planId}/edit-lock`;
  }
}
