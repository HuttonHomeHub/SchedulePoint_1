/**
 * How one code file reached the browser, read from its Resource Timing entry (`docs/TECH_DEBT.md`
 * #433).
 *
 * **The deciding question is whether a file went to the network at all**, not how fast it came:
 * a file served from cache costs no round trip, a revalidated one costs a round trip with no body,
 * and a downloaded one costs both. The three are told apart by the transfer size and, where the
 * browser exposes it, the response status.
 *
 * Pure, and kept apart from the runner so every branch is assertable from a literal — the
 * `formatProbeReport` precedent. Nothing here reads the DOM.
 */

/** The fields of `PerformanceResourceTiming` this probe reads. Optional because browsers differ. */
export interface TimingRecord {
  readonly name: string;
  readonly nextHopProtocol?: string | undefined;
  /** Undefined when the browser does not expose it; `0` means "no network bytes". */
  readonly transferSize?: number | undefined;
  readonly encodedBodySize?: number | undefined;
  readonly decodedBodySize?: number | undefined;
  /**
   * Chromium 109+, Firefox 129+, Safari 16.4+. Absent elsewhere. **Chromium reports 200 for a
   * revalidated file**, so a 304 here is sufficient evidence of a revalidation and never necessary.
   */
  readonly responseStatus?: number | undefined;
  /** Milliseconds on the `performance.now()` clock; lets a limb tell its own requests from boot's. */
  readonly startTime?: number | undefined;
}

export type Delivery = 'cache' | 'revalidated' | 'downloaded' | 'not-exposed';

export interface Classification {
  readonly delivery: Delivery;
  /**
   * True when the answer rests on the sizes rather than on a 304 status. A heuristic that is not
   * labelled as one reads as a measurement, which is the failure this probe exists to remove from
   * #433.
   */
  readonly heuristic: boolean;
}

/**
 * **What a revalidation looks like was measured, not assumed** (`m2-measurement.md`, Chromium 153
 * against `vite preview`, which answers `Cache-Control: no-cache` with a weak `ETag` and a real 304):
 * the entry reports `transferSize` ~300 (the headers), `encodedBodySize` 0, `decodedBodySize` 0 and
 * **`responseStatus` 200**. The status of a revalidated file is the merged 200, never 304, so a
 * classifier that trusted an exposed status called every one of them "downloaded" — the first
 * version of this function did, and read a server that revalidates every file as one that
 * re-downloads every file. A downloaded file has a body; a revalidated one has headers only.
 */
export function classifyEntry(entry: TimingRecord): Classification {
  const { transferSize, encodedBodySize, decodedBodySize, responseStatus } = entry;
  if (transferSize === undefined) return { delivery: 'not-exposed', heuristic: false };

  // A cache hit reports no network bytes but a real body. `0` with no body is what a browser
  // reports for a response it will not describe, so it is "not exposed" rather than "from cache".
  if (transferSize === 0) {
    return (decodedBodySize ?? 0) > 0
      ? { delivery: 'cache', heuristic: false }
      : { delivery: 'not-exposed', heuristic: false };
  }

  if (responseStatus === 304) return { delivery: 'revalidated', heuristic: false };

  // Network bytes and no body: headers only, which is what a 304 moves.
  if (encodedBodySize === 0 && decodedBodySize === 0) {
    return { delivery: 'revalidated', heuristic: true };
  }

  const statusExposed = responseStatus !== undefined && responseStatus > 0;
  // A browser that reports neither a status nor an empty body: a transfer smaller than the body it
  // served is headers plus a fragment of nothing, i.e. a revalidation. A small file whose headers
  // outweigh its body is misread as downloaded, which is why this is labelled.
  const smallerThanBody = (encodedBodySize ?? 0) > 0 && transferSize < (encodedBodySize ?? 0);
  if (!statusExposed && smallerThanBody) return { delivery: 'revalidated', heuristic: true };
  return { delivery: 'downloaded', heuristic: !statusExposed };
}

/**
 * Whether a resource is a code file this probe counts. A development server serves unbundled
 * `/src/` modules rather than `/assets/` chunks, so the test is "a script", not "under /assets/"
 * (spec US-1). The API and everything cross-origin are excluded: the first is not code, and the
 * second reports zeroed sizes that would read as cache hits.
 */
export function isCodeEntry(entry: TimingRecord, origin: string): boolean {
  let url: URL;
  try {
    url = new URL(entry.name);
  } catch {
    return false;
  }
  if (url.origin !== origin) return false;
  if (url.pathname.startsWith('/api/')) return false;
  return /\.(?:m?js|jsx|tsx?)$/.test(url.pathname) || url.pathname.startsWith('/@');
}

export interface Tally {
  readonly observed: number;
  readonly cache: number;
  readonly revalidated: number;
  readonly downloaded: number;
  readonly notExposed: number;
  /** How many of the counts above rest on the size heuristic rather than the response status. */
  readonly heuristic: number;
  /** Distinct `nextHopProtocol` values, `null` standing for "not exposed by this browser". */
  readonly protocols: readonly (string | null)[];
}

export function tally(entries: readonly TimingRecord[]): Tally {
  let cache = 0;
  let revalidated = 0;
  let downloaded = 0;
  let notExposed = 0;
  let heuristic = 0;
  const protocols = new Set<string | null>();
  for (const entry of entries) {
    const c = classifyEntry(entry);
    if (c.delivery === 'cache') cache += 1;
    else if (c.delivery === 'revalidated') revalidated += 1;
    else if (c.delivery === 'downloaded') downloaded += 1;
    else notExposed += 1;
    if (c.heuristic) heuristic += 1;
    // A cache hit travelled nowhere, so its protocol is whatever the original fetch used and the
    // browser may report an empty string; the empty string is "not exposed", never a protocol.
    if (c.delivery !== 'cache') {
      protocols.add(
        entry.nextHopProtocol === undefined || entry.nextHopProtocol === ''
          ? null
          : entry.nextHopProtocol,
      );
    }
  }
  return {
    observed: entries.length,
    cache,
    revalidated,
    downloaded,
    notExposed,
    heuristic,
    protocols: [...protocols].sort((a, b) => String(a).localeCompare(String(b))),
  };
}
