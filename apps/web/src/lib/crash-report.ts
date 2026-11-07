import { API_BASE_URL, APP_VERSION } from '@/config/env';
import { ApiFetchError } from '@/lib/api/client';
import { isChunkLoadFailure } from '@/lib/chunk-load-failure';
import { setCrashReference } from '@/lib/crash-reference';

/**
 * Sends a screen crash to `POST /api/v1/crash-reports` (`docs/API.md`, ADR-0211).
 *
 * **It runs while the app is already broken, so it must never make things worse:** the whole of
 * {@link reportCrash} sits in one `try`, nothing here awaits on the caller's path, and a failure
 * (no network, a 429, a private-mode `sessionStorage`) is simply no report. The server cleans the
 * text again; the client's part is to keep a query string or fragment out of the body, because
 * those are where a token or a customer's slug lives.
 *
 * Kept free of dependencies beyond the env constants because `router.tsx` imports it on the boot path.
 */

/** Field caps match the server's (`crash-report-clean.ts`), so nothing is sent only to be cut. */
const MAX_NAME = 100;
const MAX_MESSAGE = 300;
const MAX_STACK = 4_000;
const MAX_COMPONENT_STACK = 2_000;
const MAX_ROUTE_ID = 200;

/** A looping crash must not become a request storm: three reports per page load, then silence. */
const MAX_REPORTS_PER_LOAD = 3;
const SEEN_KEY = 'sp.crash-reports.seen';
const MAX_SEEN = 50;

export interface CrashInput {
  readonly error: unknown;
  readonly boundary: 'route' | 'app';
  /** The route pattern (`/orgs/$orgSlug/...`), never a concrete path. */
  readonly routeId?: string | undefined;
  readonly componentStack?: string | null | undefined;
}

export interface CrashReportBody {
  name: string;
  message: string;
  stack?: string;
  componentStack?: string;
  routeId?: string;
  boundary: 'route' | 'app';
  webVersion: string;
}

/**
 * Drops `?query` and `#fragment` from every URL-shaped token. A location ends at `:line:col`, a
 * `)` or whitespace, so the strip runs to whichever comes first.
 */
function stripQueries(text: string): string {
  return text.replace(/(https?:\/\/[^\s)?#]*)[?#][^\s)]*?(?=(?::\d+){0,2}(?:[)\s]|$))/g, '$1');
}

function cap(text: string, max: number): string {
  return text.length <= max ? text : text.slice(0, max);
}

/** Whether a crash is a defect, rather than the network or the API's answer reaching the screen. */
export function isReportable(error: unknown): boolean {
  return !(error instanceof ApiFetchError) && !isChunkLoadFailure(error);
}

/** The pure part: what would be sent. `null` for a crash that is not reportable. */
export function buildCrashReport(input: CrashInput): CrashReportBody | null {
  if (!isReportable(input.error)) return null;
  const error = input.error;
  const isError = error instanceof Error;
  const body: CrashReportBody = {
    name: cap(isError ? error.name : 'NonError', MAX_NAME),
    message: cap(stripQueries(isError ? error.message : String(error)), MAX_MESSAGE),
    boundary: input.boundary,
    webVersion: APP_VERSION,
  };
  if (isError && typeof error.stack === 'string') {
    body.stack = cap(stripQueries(error.stack), MAX_STACK);
  }
  if (input.componentStack) {
    body.componentStack = cap(stripQueries(input.componentStack), MAX_COMPONENT_STACK);
  }
  if (input.routeId) body.routeId = cap(input.routeId, MAX_ROUTE_ID);
  return body;
}

/** The identity of one crash for "once per tab session": where, what, and the first frame. */
function dedupeKey(body: CrashReportBody): string {
  const firstFrame = body.stack?.split('\n').find((line) => line.includes(':')) ?? '';
  return [body.boundary, body.routeId ?? '', body.name, body.message, firstFrame].join('\u001f');
}

function readSeen(): string[] {
  try {
    const parsed: unknown = JSON.parse(sessionStorage.getItem(SEEN_KEY) ?? '[]');
    return Array.isArray(parsed) ? parsed.filter((v): v is string => typeof v === 'string') : [];
  } catch {
    return [];
  }
}

/** `true` when this crash was already reported in this tab. Private modes may refuse storage. */
function alreadySeen(key: string): boolean {
  const seen = readSeen();
  if (seen.includes(key)) return true;
  try {
    sessionStorage.setItem(SEEN_KEY, JSON.stringify([...seen, key].slice(-MAX_SEEN)));
  } catch {
    // Without storage the per-load cap is the only limit; that is enough to stay bounded.
  }
  return false;
}

let sentThisLoad = 0;
let signedIn: () => boolean = () => false;

/** Registered once by the router, which owns the query cache; unregistered means "not signed in". */
export function setCrashReportSessionProbe(probe: () => boolean): void {
  signedIn = probe;
}

/** For tests: the per-load counter and the probe are module state. */
export function resetCrashReportState(): void {
  sentThisLoad = 0;
  signedIn = () => false;
  setCrashReference(null);
}

function isReference(value: unknown): value is string {
  return typeof value === 'string' && /^[0-9A-Fa-f]{6}$/.test(value);
}

async function send(body: CrashReportBody): Promise<void> {
  const response = await fetch(`${API_BASE_URL}/crash-reports`, {
    method: 'POST',
    credentials: 'include',
    keepalive: true,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!response.ok) return;
  const payload = (await response.json()) as { data?: { reference?: unknown } } | null;
  const reference = payload?.data?.reference;
  if (isReference(reference)) setCrashReference(reference.toUpperCase());
}

/**
 * Report a crash if it is reportable, the person is signed in, it has not been reported in this
 * tab, and the page load's budget is not spent. **Never throws and never rejects.**
 */
export function reportCrash(input: CrashInput): void {
  try {
    // A new crash replaces the screen, so a reference from an earlier one must not label it.
    setCrashReference(null);
    if (sentThisLoad >= MAX_REPORTS_PER_LOAD || !signedIn()) return;
    const body = buildCrashReport(input);
    if (body === null || alreadySeen(dedupeKey(body))) return;
    sentThisLoad += 1;
    send(body).catch(() => undefined);
  } catch {
    // A reporter that throws inside a crash handler would replace the fallback with nothing.
  }
}
