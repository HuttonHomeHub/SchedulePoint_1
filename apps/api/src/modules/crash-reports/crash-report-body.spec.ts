import { describe, expect, it } from 'vitest';

import {
  browserOf,
  dedupeHashOf,
  normaliseCrashReport,
  referenceOf,
  type NormalisedCrashReport,
} from './crash-report-body';

const ORIGINS = ['https://app.example'];

const CHROME =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Safari/537.36';
const EDGE = `${CHROME} Edg/141.0.3537.57`;
const FIREFOX = 'Mozilla/5.0 (X11; Linux x86_64; rv:132.0) Gecko/20100101 Firefox/132.0';
const SAFARI =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Safari/605.1.15';

describe('browserOf', () => {
  it.each([
    [CHROME, 'chrome', 141],
    [EDGE, 'edge', 141],
    [FIREFOX, 'firefox', 132],
    [SAFARI, 'safari', 17],
    [`${CHROME} OPR/117.0.0.0`, 'other', null],
    ['curl/8.5.0', 'other', null],
    ['', 'other', null],
  ])('reads %s as %s %s', (ua, browser, browserMajor) => {
    expect(browserOf(ua)).toEqual({ browser, browserMajor });
  });

  it('answers other for a missing or non-string header', () => {
    expect(browserOf(undefined)).toEqual({ browser: 'other', browserMajor: null });
    expect(browserOf(['x'])).toEqual({ browser: 'other', browserMajor: null });
  });

  it('stores no major version longer than four digits (the CHECK is 0..9999)', () => {
    expect(browserOf('Chrome/123456789').browserMajor).toBeNull();
    expect(browserOf('Chrome/9999').browserMajor).toBe(9999);
  });
});

describe('normaliseCrashReport', () => {
  const body = {
    name: 'TypeError',
    message: "Cannot read properties of undefined (reading 'startAt')",
    stack: 'TypeError: x\n    at PlanView (/assets/plan.jsx:1:2)',
    componentStack: '\n    at PlanView (/assets/plan.jsx:1:2)\n    at div',
    routeId: '/_authed/orgs/$orgSlug/plans/$planId',
    boundary: 'route',
    webVersion: '0.200.7',
  };

  it('returns a cleaned report', () => {
    expect(normaliseCrashReport(body, ORIGINS)).toEqual({
      boundary: 'route',
      errorName: 'TypeError',
      message: "Cannot read properties of undefined (reading 'startAt')",
      routePattern: '/_authed/orgs/$orgSlug/plans/$planId',
      webVersion: '0.200.7',
      stack: 'PlanView @ /assets/plan.jsx:1:2',
      componentStack: 'PlanView @ /assets/plan.jsx:1:2\ndiv',
      topFrames: ['PlanView @ /assets/plan.jsx:1:2'],
    });
  });

  it.each([
    null,
    undefined,
    'x',
    7,
    [],
    {},
    { name: ' ', message: '' },
    { stack: 'at a (/x:1:2)' },
  ])('answers null for the unusable body %j', (unusable) => {
    expect(normaliseCrashReport(unusable, ORIGINS)).toBeNull();
  });

  it('accepts a name alone and a message alone', () => {
    expect(normaliseCrashReport({ name: 'NonError' }, ORIGINS)?.message).toBe('');
    expect(normaliseCrashReport({ message: 'boom' }, ORIGINS)?.errorName).toBe('Error');
  });

  it('maps an unknown boundary to route and keeps app', () => {
    expect(normaliseCrashReport({ ...body, boundary: 'window' }, ORIGINS)?.boundary).toBe('route');
    expect(normaliseCrashReport({ ...body, boundary: 'app' }, ORIGINS)?.boundary).toBe('app');
  });

  it('nulls a route id that fails the shape and keeps no stack for a non-Error throw', () => {
    const report = normaliseCrashReport(
      { name: 'NonError', message: 'x', routeId: '/a b' },
      ORIGINS,
    );
    expect(report).toMatchObject({ routePattern: null, stack: null, componentStack: null });
  });

  it('keeps only the first five frames for the key', () => {
    const stack = Array.from({ length: 9 }, (_v, i) => `at f${i} (/a.js:${i + 1}:1)`).join('\n');
    expect(normaliseCrashReport({ ...body, stack }, ORIGINS)?.topFrames).toHaveLength(5);
  });
});

describe('dedupeHashOf', () => {
  const base: NormalisedCrashReport = {
    boundary: 'route',
    errorName: 'TypeError',
    message: 'm',
    routePattern: '/r',
    webVersion: '1.0.0',
    stack: null,
    componentStack: null,
    topFrames: ['a @ /x.jsx:1:2'],
  };

  it('is a sha256 hex digest, and its prefix is the reference', () => {
    const hash = dedupeHashOf(base, 'chrome');
    expect(hash).toMatch(/^[0-9a-f]{64}$/);
    expect(referenceOf(hash)).toBe(hash.slice(0, 6).toUpperCase());
  });

  it('puts the release, the browser and the route in the key', () => {
    const hash = dedupeHashOf(base, 'chrome');
    expect(dedupeHashOf({ ...base, webVersion: '1.0.1' }, 'chrome')).not.toBe(hash);
    expect(dedupeHashOf(base, 'firefox')).not.toBe(hash);
    expect(dedupeHashOf({ ...base, routePattern: null }, 'chrome')).not.toBe(hash);
  });

  it('keeps the last-writer-wins stacks out of the key', () => {
    const hash = dedupeHashOf(base, 'chrome');
    expect(dedupeHashOf({ ...base, stack: 'x', componentStack: 'y' }, 'chrome')).toBe(hash);
  });

  it('does not conflate values that differ only at a field boundary', () => {
    // A `|` join would collapse ('a|b','c') and ('a','b|c'); the unit separator cannot.
    const one = dedupeHashOf({ ...base, errorName: 'A', message: 'b|c' }, 'chrome');
    const two = dedupeHashOf(
      { ...base, errorName: 'A', message: 'b', routePattern: '|c' },
      'chrome',
    );
    expect(one).not.toBe(two);
  });
});
