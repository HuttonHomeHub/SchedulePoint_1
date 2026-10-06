/**
 * How fresh the page's figures are, as one honest statement (spec D-5).
 *
 * **The time is the OLDEST of the reads, so it never claims more freshness than the stalest box
 * has.** A page whose health was read a minute ago and whose activity was read an hour ago is an
 * hour old for the purpose of "is this still true?". A read that is failing contributes no time (its
 * last answer is not a reading of now) and is counted instead.
 */
export interface ReadFacts {
  /** `query.dataUpdatedAt`: a millisecond timestamp, `0` when nothing has ever been read. */
  dataUpdatedAt: number;
  isError: boolean;
  isPending: boolean;
}

export interface Freshness {
  /** The oldest successful read, or null while nothing has settled. */
  readAt: Date | null;
  /** How many reads are in a failed state. */
  unreadable: number;
  /** True once no read is pending, whatever each one answered. */
  settled: boolean;
}

export function freshnessOf(reads: ReadFacts[]): Freshness {
  const answered = reads.filter((read) => !read.isError && read.dataUpdatedAt > 0);
  const oldest = answered.length === 0 ? null : Math.min(...answered.map((r) => r.dataUpdatedAt));
  return {
    readAt: oldest === null ? null : new Date(oldest),
    unreadable: reads.filter((read) => read.isError).length,
    settled: reads.every((read) => !read.isPending),
  };
}
