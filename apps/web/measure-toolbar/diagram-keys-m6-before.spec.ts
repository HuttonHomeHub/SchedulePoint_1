import { mkdirSync } from 'node:fs';
import { join } from 'node:path';

import { type Page } from '@playwright/test';

import { holdThePen } from '../e2e-support/pen';
import { expect, test } from '../e2e-support/test';
import {
  calculateSeededPlan,
  cursorTo,
  diagramList,
  openPlanId,
  openSeededPlan,
} from '../e2e-swimlanes/support';

import { clearMeasurement, writeMeasurement } from './output';

/**
 * Diagram keys and selection, M6, step 1: the fullest single-selection bar, read before building.
 * Throwaway harness (ADR-0081 section 3): asserts nothing about a pixel. The bar is one hand-placed,
 * conflicted activity under a WBS summary, on a plan with hand-made swimlanes and a code type, with
 * the pen. "Full width" is the same bar with the plan facts hidden by an injected rule (probe only).
 */
const OUT = join(process.cwd(), 'measure-output', 'diagram-keys-m6-before');

async function read(page: Page): Promise<Record<string, unknown>> {
  return page.evaluate(() => {
    const r = (n: number): number => Math.round(n * 10) / 10;
    const foot = document.querySelector('[data-activities-bar]');
    const scene = document.querySelector(
      'section[aria-label="Time-scaled logic diagram"] canvas[data-layer="scene"]',
    );
    const bar = [...document.querySelectorAll('[role="toolbar"]')].find((el) =>
      /^Actions for /.test(el.getAttribute('aria-label') ?? ''),
    );
    const controls = [...(bar?.parentElement?.querySelectorAll<HTMLElement>('button, a') ?? [])]
      .map((el) => ({ el, b: el.getBoundingClientRect() }))
      .filter(({ b }) => b.width > 0 && b.height > 0);
    const tops: number[] = [];
    for (const t of controls.map(({ b }) => b.top).sort((a, b) => a - b)) {
      const last = tops[tops.length - 1];
      if (last === undefined || t - last > 3) tops.push(t);
    }
    const trail = document.querySelector('[data-foot-trail]');
    return {
      viewport: { w: window.innerWidth, h: window.innerHeight },
      footHeight: r(foot?.getBoundingClientRect().height ?? 0),
      footWidth: r(foot?.getBoundingClientRect().width ?? 0),
      sceneHeight: r(scene?.getBoundingClientRect().height ?? 0),
      barWidth: r(bar?.getBoundingClientRect().width ?? 0),
      lines: tops.length,
      controlCount: controls.length,
      controls: controls.map(({ el, b }) => ({
        label: (el.getAttribute('aria-label') ?? el.textContent ?? '').trim().slice(0, 40),
        shaded: el.getAttribute('aria-disabled') === 'true',
        top: r(b.top),
        left: r(b.left),
        width: r(b.width),
      })),
      factsWidth: r(trail?.firstElementChild?.getBoundingClientRect().width ?? 0),
      footScrollX: foot ? foot.scrollWidth - foot.clientWidth : 0,
    };
  });
}

test('M6 before: the fullest single bar, today and at the full foot width', async ({ page }) => {
  test.setTimeout(240_000);
  clearMeasurement('diagram-keys-m6-before');
  mkdirSync(OUT, { recursive: true });
  const stamp = Date.now();
  const orgSlug = await openSeededPlan(page, stamp);
  await holdThePen(page);
  await calculateSeededPlan(page);
  const planId = openPlanId(page);

  const setup = await page.evaluate(
    async ({ org, id }: { org: string; id: string }) => {
      const base = `/api/v1/organizations/${org}`;
      const call = async (
        method: string,
        path: string,
        body?: unknown,
      ): Promise<{ id: string; version: number; name?: string }> => {
        const res = await fetch(`${base}${path}`, {
          method,
          credentials: 'include',
          headers: { 'content-type': 'application/json' },
          ...(body === undefined ? {} : { body: JSON.stringify(body) }),
        });
        if (!res.ok)
          throw new Error(`${method} ${path} ${String(res.status)}: ${await res.text()}`);
        const json = (await res.json()) as { data: unknown };
        return json.data as { id: string; version: number };
      };
      const summary = await call('POST', `/plans/${id}/activities`, {
        name: 'Substructure package',
        type: 'WBS_SUMMARY',
        laneIndex: 20,
      });
      const list = (await (
        await fetch(`${base}/plans/${id}/activities?limit=100`, { credentials: 'include' })
      ).json()) as { data: { id: string; name: string; version: number }[] };
      const target = list.data.find((a) => a.name === 'Pile caps');
      if (!target) throw new Error('no Pile caps');
      await call('PATCH', `/activities/${target.id}`, {
        parentId: summary.id,
        constraintType: 'MANDATORY_START',
        constraintDate: '2025-12-22',
        visualStart: '2026-01-20',
        version: target.version,
      });
      const type = await call('POST', `/plans/${id}/code-types`, { name: 'Area' });
      await call('POST', `/plans/${id}/code-types/${type.id}/values`, { shortCode: 'GF' });
      await call('POST', `/plans/${id}/schedule/recalculate`);
      return true;
    },
    { org: orgSlug, id: planId },
  );
  expect(setup).toBe(true);
  await page.reload();
  await holdThePen(page);

  const out: Record<string, unknown> = {};
  for (const size of [
    { w: 1024, h: 600 },
    { w: 1280, h: 720 },
  ]) {
    await page.setViewportSize({ width: size.w, height: size.h });
    const list = diagramList(page);
    await expect(list.getByRole('option').first()).toBeVisible({ timeout: 30_000 });
    await list.focus();
    await list.press('Escape');
    const idle = await read(page);
    await cursorTo(page, 'Pile caps');
    await expect(page.getByRole('toolbar', { name: /^Actions for Pile caps/ })).toBeVisible();
    await page.waitForTimeout(600);
    const today = await read(page);
    await page.screenshot({ path: join(OUT, `today-${String(size.w)}x${String(size.h)}.png`) });
    await page.addStyleTag({
      content: '[data-foot-trail] > :first-child { display: none !important; }',
    });
    await page.waitForTimeout(600);
    const full = await read(page);
    await page.screenshot({ path: join(OUT, `fullwidth-${String(size.w)}x${String(size.h)}.png`) });
    out[`${String(size.w)}x${String(size.h)}`] = { idle, today, fullWidth: full };
    await page.reload();
    await holdThePen(page);
  }
  const path = writeMeasurement('diagram-keys-m6-before', out);
  // eslint-disable-next-line no-console
  console.log(`[m6 before] wrote ${path}`);
});
