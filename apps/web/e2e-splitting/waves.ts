/** One resource-timing row: when a request began and when its response finished, in one clock. */
export interface TimedRequest {
  readonly name: string;
  readonly startTime: number;
  readonly responseEnd: number;
}

/**
 * The depth of the longest **sequential** chain of requests: a request is one wave deeper than the
 * deepest request that had already finished when it started.
 *
 * **This is what P3 measures and the byte gate cannot** (`docs/specs/route-code-splitting/`, spec
 * §3 "the gap"). Six chunks requested together are one wave, however many requests; two chunks
 * where the second is only discovered when the first has been parsed are two, however small. A
 * request count would call the first six and the second two, which is the wrong way round for a
 * 150 ms round trip.
 *
 * Pure, so `waves.spec.ts` can drive it with a serialised chain and a parallel burst and show it
 * tells them apart (ADR-0110: a measurement is verified against the defect it names).
 */
export function countWaves(requests: readonly TimedRequest[]): number {
  const ordered = [...requests].sort((a, b) => a.startTime - b.startTime);
  const depth: number[] = [];
  let deepest = 0;
  ordered.forEach((request, i) => {
    let behind = 0;
    for (let j = 0; j < i; j += 1) {
      const earlier = ordered[j];
      const earlierDepth = depth[j];
      if (earlier && earlierDepth !== undefined && earlier.responseEnd <= request.startTime) {
        behind = Math.max(behind, earlierDepth);
      }
    }
    depth[i] = behind + 1;
    deepest = Math.max(deepest, depth[i] ?? 0);
  });
  return deepest;
}
