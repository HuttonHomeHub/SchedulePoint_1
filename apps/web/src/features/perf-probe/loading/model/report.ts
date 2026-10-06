import type { Tally } from './classify';
import type { CacheControlReading, Limb, LimbName, LoadingReading } from './limb';

const LIMB_TITLES: Record<LimbName, string> = {
  reload: 'Reload',
  revisit: 'Revisit',
  network: 'From the network (nothing cached)',
};

const INTENDED_TYPE: Record<LimbName, string> = {
  reload: 'reload',
  revisit: 'navigate',
  network: 'no-store fetch',
};

export const NOT_DEVELOPMENT_NOTE = 'production build';
export const DEVELOPMENT_LABEL = 'development build: not a reading of the live server';

/**
 * The two lines every limb needs: how many files went to the network, which is the deciding number
 * (#433's question is whether a reload pays round trips for hashed code), and the split behind it.
 */
export function limbLines(limb: Limb): string[] {
  const title = `${LIMB_TITLES[limb.name]} (${INTENDED_TYPE[limb.name]})`;
  if (limb.status === 'not-taken') {
    return [`${title}: NOT TAKEN`, `  Why: ${limb.reason}`];
  }
  const t = limb.tally;
  const lines = [
    `${title}: ${limb.status === 'taken' ? 'taken' : 'INCOMPLETE'}`,
    ...(limb.status === 'incomplete' ? [`  Why: ${limb.reason}`] : []),
    `  Code files observed: ${String(t.observed)}`,
    `  Went to the network: ${String(t.revalidated + t.downloaded)}`,
    `  From cache: ${String(t.cache)}, revalidated: ${String(t.revalidated)}, downloaded: ${String(t.downloaded)}, not exposed: ${String(t.notExposed)}`,
    `  Protocol: ${protocolText(t)}`,
    `  Ready in: ${String(Math.round(limb.readyMs))} ms`,
  ];
  if (t.heuristic > 0) {
    lines.push(
      `  ${String(t.heuristic)} of these are inferred from transfer and body sizes rather than read from a 304 status (a file that moved headers and no body is a revalidation; this browser reports it as a 200)`,
    );
  }
  if (limb.status === 'taken' && limb.note !== undefined) lines.push(`  Note: ${limb.note}`);
  return lines;
}

export function protocolText(t: Tally): string {
  if (t.protocols.length === 0) return 'none (nothing went to the network)';
  return t.protocols.map((p) => p ?? 'not exposed by this browser').join(', ');
}

export function cacheControlLine(reading: CacheControlReading): string {
  if (reading.status === 'failed') return `Cache-Control: could not be read (${reading.reason})`;
  const path = pathOf(reading.url);
  if (reading.value === null) return `Cache-Control on ${path}: none sent`;
  const immutable = /(?:^|[\s,])immutable(?:[\s,=]|$)/i.test(reading.value);
  return `Cache-Control on ${path}: ${reading.value} (immutable: ${immutable ? 'yes' : 'no'})`;
}

function pathOf(url: string): string {
  try {
    return new URL(url).pathname;
  } catch {
    return url;
  }
}

/**
 * The browser name and major version, from the user agent, or "unrecognised browser" when nothing
 * matches. **Never the raw agent**: it is free text that ends up in a block pasted into a record.
 * Order matters: Edge and Opera carry `Chrome/` too, and Chrome carries `Safari/`.
 */
export function describeBrowser(userAgent: string): string {
  const rules: readonly [RegExp, string][] = [
    [/Edg(?:e|A|iOS)?\/(\d+)/, 'Edge'],
    [/OPR\/(\d+)/, 'Opera'],
    [/Firefox\/(\d+)/, 'Firefox'],
    [/(?:Chrome|CriOS|HeadlessChrome)\/(\d+)/, 'Chrome'],
    [/Version\/(\d+).*Safari/, 'Safari'],
  ];
  for (const [pattern, name] of rules) {
    const match = pattern.exec(userAgent);
    if (match?.[1] !== undefined) return `${name} ${match[1]}`;
  }
  return 'unrecognised browser';
}

/** What the section is for, in one place so the screen and the pasted block say the same thing. */
export const MEASURES_SENTENCE =
  'This measures how the plan screen’s code reaches this browser on a reload and on a revisit. It does not measure the plan’s own data requests or any other browser.';

/**
 * Why the reload limb can read as "downloaded" on a perfect server: a browser that has never opened
 * the plan screen has nothing cached to reload, and the probe does not prime it. Found while
 * verifying against the defect (`m2-measurement.md`), where the first reading on an origin that had
 * not yet warmed the plan chunks would have been misread as a caching failure.
 */
export const PRIME_SENTENCE =
  'Open a plan in this browser before measuring: files it has never fetched are downloaded on the reload whatever the server says, and the revisit is the reading that always has them to reuse.';

export function formatLoadingReport(reading: LoadingReading): string {
  return [
    'SchedulePoint plan-screen loading reading',
    `Taken: ${reading.takenAt}`,
    `Browser: ${reading.browser} (this reading speaks for this browser only)`,
    `Web version: ${reading.webVersion}`,
    `API version: ${reading.apiVersion ?? 'not yet known'}`,
    `Build: ${reading.development ? DEVELOPMENT_LABEL : NOT_DEVELOPMENT_NOTE}`,
    '',
    ...limbLines(reading.reload),
    '',
    ...limbLines(reading.revisit),
    '',
    ...limbLines(reading.network),
    '',
    cacheControlLine(reading.cacheControl),
    '',
    MEASURES_SENTENCE,
    PRIME_SENTENCE,
    'Nothing was sent anywhere: the press made no request to the API and stored nothing on the server.',
  ].join('\n');
}

/** One sentence for the panel's polite region. */
export function loadingStatus(reading: LoadingReading): string {
  const part = (limb: Limb): string =>
    limb.status === 'not-taken'
      ? `${limb.name} not taken`
      : `${limb.name} ${String(limb.tally.revalidated + limb.tally.downloaded)} of ${String(limb.tally.observed)} to the network${limb.status === 'incomplete' ? ' (incomplete)' : ''}`;
  return `Plan loading measured${reading.development ? ' on a development build' : ''}: ${part(reading.reload)}; ${part(reading.revisit)}.`;
}

/**
 * The answer in one plain line, above the raw ones. "Reloading a plan re-downloads its code" is the
 * row's own question; the raw lines stay for the pasted record.
 */
export function plainVerdict(reading: LoadingReading): string {
  const limb = reading.reload;
  if (limb.status !== 'taken') {
    return 'Reloading a plan re-downloads its code: could not be told from this run.';
  }
  const toNetwork = limb.tally.revalidated + limb.tally.downloaded;
  return toNetwork > 0
    ? `Reloading a plan re-downloads its code: yes — ${String(toNetwork)} of ${String(limb.tally.observed)} files went to the network.`
    : 'Reloading a plan re-downloads its code: no — every file came from this browser’s cache.';
}

/**
 * A reload that downloaded while the revisit, right after it, used the cache is what a browser that
 * had never opened a plan looks like. The probe cannot see whether a plan was opened first, so the
 * screen says what that pattern probably is rather than leaving it as a finding.
 */
export function coldReloadWarning(reading: LoadingReading): string | null {
  const { reload, revisit } = reading;
  if (reload.status !== 'taken' || revisit.status !== 'taken') return null;
  return reload.tally.downloaded > 0 && revisit.tally.revalidated + revisit.tally.downloaded === 0
    ? 'The reload downloaded files that the revisit then reused. If no plan had been opened in this browser first, this is probably a false alarm: open a plan, then measure again.'
    : null;
}

/** What a failed run says to a reader. The raw error goes to the console, never to the screen. */
export const FAILURE_SENTENCE =
  'The measurement could not finish. Press Measure plan loading to try again.';
