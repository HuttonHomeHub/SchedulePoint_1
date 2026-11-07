import { createHash } from 'node:crypto';

import {
  cleanComponentStack,
  cleanErrorName,
  cleanFrames,
  cleanMessage,
  cleanRoutePattern,
  cleanWebVersion,
  stackText,
} from './crash-report-clean';

/** One distinct crash, in the shape the table stores. Every text value is already cleaned. */
export interface NormalisedCrashReport {
  readonly boundary: 'route' | 'app';
  readonly errorName: string;
  readonly message: string;
  readonly routePattern: string | null;
  readonly webVersion: string;
  readonly stack: string | null;
  readonly componentStack: string | null;
  /** The first five cleaned frames: the part of the stack that is in the dedupe key. */
  readonly topFrames: readonly string[];
}

export type BrowserFamily = 'chrome' | 'edge' | 'firefox' | 'safari' | 'other';

export interface BrowserInfo {
  readonly browser: BrowserFamily;
  /** At most four digits (`ck_crash_reports_browser_major`), or null. */
  readonly browserMajor: number | null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function nonEmpty(value: unknown): boolean {
  return typeof value === 'string' && value.trim() !== '';
}

/**
 * Parse the posted body into one cleaned report, or `null` for anything unusable. **Never throws.**
 *
 * Normalise-and-drop rather than a `class-validator` DTO that answers 422, for the reason the CSP
 * sink gives: the caller is a crashed screen that cannot act on a refusal, and one rejected field
 * would lose the whole report. `sameOrigins` is the installation's own web origins (lower-case, no
 * trailing slash); a stack frame from any other origin is reduced to its scheme.
 *
 * `boundary` defaults to `route` when absent or unknown: the router's per-match boundary catches
 * almost every real crash (spec §0), so a caller that says nothing is most likely that one.
 */
export function normaliseCrashReport(
  body: unknown,
  sameOrigins: readonly string[],
): NormalisedCrashReport | null {
  if (!isRecord(body)) return null;
  if (!nonEmpty(body['name']) && !nonEmpty(body['message'])) return null;

  const frames = cleanFrames(body['stack'], sameOrigins);
  return {
    boundary: body['boundary'] === 'app' ? 'app' : 'route',
    errorName: cleanErrorName(body['name']),
    message: cleanMessage(body['message']),
    routePattern: cleanRoutePattern(body['routeId']),
    webVersion: cleanWebVersion(body['webVersion']),
    stack: stackText(frames),
    componentStack: cleanComponentStack(body['componentStack'], sameOrigins),
    topFrames: frames.slice(0, 5),
  };
}

/**
 * The browser family and major version from the caller's own `User-Agent`. **The full string is
 * never stored.** Order matters: Edge, Opera and Samsung Internet all say `Chrome/`, and Chrome says
 * `Safari/`, so the more specific token is tested first and a Chromium derivative that is not Edge
 * is `other` rather than inflating Chrome.
 */
export function browserOf(userAgent: unknown): BrowserInfo {
  const ua = typeof userAgent === 'string' ? userAgent.slice(0, 512) : '';
  const find = (browser: BrowserFamily, pattern: RegExp): BrowserInfo | null => {
    const match = pattern.exec(ua);
    if (!match) return null;
    const digits = match[1] ?? '';
    // A longer run is out of the CHECK's range (or int4's) and is the caller's, not a version.
    return {
      browser,
      browserMajor: digits.length > 0 && digits.length <= 4 ? Number(digits) : null,
    };
  };

  if (/\b(?:OPR|Opera|SamsungBrowser|Vivaldi|YaBrowser)\//.test(ua)) {
    return { browser: 'other', browserMajor: null };
  }
  return (
    find('edge', /\bEdg(?:e|A|iOS)?\/(\d+)/) ??
    find('firefox', /\b(?:Firefox|FxiOS)\/(\d+)/) ??
    find('chrome', /\b(?:Chrome|CriOS)\/(\d+)/) ??
    find('safari', /\bVersion\/(\d+)[\s\S]*\bSafari\//) ?? { browser: 'other', browserMajor: null }
  );
}

/**
 * The dedupe key: SHA-256 over the STORED values, release and browser included on purpose (a crash
 * that returns after a fix is a new row, spec §2). Joined on U+001F, which no cleaned value can hold
 * (the cleaners strip every control character), so `('a','b|c')` and `('a|b','c')` cannot share a
 * row the way a `|` join would let them (`csp-report.service.ts`).
 */
export function dedupeHashOf(report: NormalisedCrashReport, browser: BrowserFamily): string {
  return createHash('sha256')
    .update(
      [
        report.webVersion,
        report.boundary,
        report.errorName,
        report.message,
        report.routePattern ?? '',
        report.topFrames.join('\n'),
        browser,
      ].join('\u001f'),
    )
    .digest('hex');
}

/** At most this many distinct crashes are stored (spec §2 "Edge cases"). Repeats still count. */
export const CRASH_REPORT_CAP = 1_000;

/** The display reference: the hash's first six characters, upper-cased. Not unique by contract. */
export function referenceOf(dedupeHash: string): string {
  return dedupeHash.slice(0, 6).toUpperCase();
}
