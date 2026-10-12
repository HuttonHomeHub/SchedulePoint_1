import { type Page } from '@playwright/test';

import { expect } from '../e2e-support/test';

/**
 * **A choice of one is a track with one raised member, and a track costs a member nothing**
 * (toolbar-grid M2, SC-5, SC-6, SC-7).
 *
 * Read in the browser because jsdom computes no Tailwind and has no layout. What a unit test can pin
 * is which classes a track carries; what has to be read from a real page is what those classes
 * COMPUTE to, and four things only a browser can answer are asked here:
 *
 * 1. **The raised member is never colour alone.** The chosen member computes a background that is not
 *    its neighbours' AND a non-`none` box-shadow (the underline). A member that differed by fill only
 *    would pass the contrast pair and fail 1.4.1.
 * 2. **Exactly one member of a switch is chosen**, and pressing another moves it.
 * 3. **No member is smaller for being in a track.** Each member is `--control-h` tall (36, or 44 under
 *    a coarse pointer), and `elementFromPoint` one pixel inside each member's own edge lands on that
 *    member: a track whose padding or gap had eaten the edge would fail it.
 * 4. **The 1 px join is the track's.** Scanning across it, every point lands on the track or on one of
 *    the two members beside it and on nothing else, and the members are 1 px apart: the gap is a gap
 *    and not a dead zone, and it did not take a pixel from either neighbour (ADR-0118).
 *
 * The roving walk is asserted too: the same stops, in DOM order, with the cluster wrappers never one
 * of them.
 *
 * Returns the number of switch and joined tracks read, so a caller can pin a positive: a page with no
 * track would satisfy every comparison here vacuously.
 */
interface TrackReading {
  id: string;
  kind: 'switch' | 'joined';
  members: {
    id: string;
    name: string;
    pressed: string | null;
    w: number;
    h: number;
    bg: string;
    shadow: string;
    gapBefore: number | null;
    leftEdgeHit: boolean;
    rightEdgeHit: boolean;
  }[];
  /** One entry per join: empty when only the track or its two members own it, else what does. */
  gapHits: string[];
  trackBg: string;
  trackH: number;
  wrapperAttrs: string[];
}

export async function readTracks(page: Page): Promise<TrackReading[]> {
  return page.evaluate(() => {
    const tracks: { id: string; kind: 'switch' | 'joined'; el: HTMLElement }[] = [];
    for (const el of document.querySelectorAll<HTMLElement>('[data-toolbar-cluster]')) {
      tracks.push({
        id: el.getAttribute('data-toolbar-cluster') ?? '',
        kind: el.getAttribute('data-toolbar-cluster-kind') === 'switch' ? 'switch' : 'joined',
        el,
      });
    }
    // The header's Diagram | Gantt: a named group painted as a switch track, kept as such.
    const planView = document.querySelector<HTMLElement>('[role="group"][aria-label="Plan view"]');
    if (planView) tracks.push({ id: 'plan-view', kind: 'switch', el: planView });

    return tracks.map(({ id, kind, el }) => {
      const focusables = [...el.querySelectorAll<HTMLElement>('[data-toolbar-focusable]')];
      const rects = focusables.map((f) => f.getBoundingClientRect());
      const members = focusables.map((f, i) => {
        const r = rects[i]!;
        const style = getComputedStyle(f);
        const prev = rects[i - 1];
        const y = r.top + r.height / 2;
        const hit = (x: number): boolean => {
          const at = document.elementFromPoint(x, y);
          return at !== null && at.closest('[data-toolbar-focusable]') === f;
        };
        return {
          id: f.getAttribute('data-toolbar-item') ?? '',
          name: f.getAttribute('aria-label') ?? f.textContent?.trim() ?? '',
          pressed: f.getAttribute('aria-pressed'),
          w: r.width,
          h: r.height,
          bg: style.backgroundColor,
          shadow: style.boxShadow,
          gapBefore: prev ? r.left - prev.right : null,
          leftEdgeHit: hit(r.left + 1),
          rightEdgeHit: hit(r.right - 1),
        };
      });
      // The join is scanned across, not probed at its midpoint: layout is fractional and hit-testing
      // snaps, so a 1 px join owns a sliver (measured: 0.4 px of the track at one alignment) and a
      // single midpoint can land on either neighbour. What cannot vary is who may own a point in it:
      // the track or one of its two members, and nothing else.
      const gapHits = members.slice(1).map((_m, i) => {
        const prev = rects[i]!;
        const next = rects[i + 1]!;
        const y = prev.top + prev.height / 2;
        for (let x = prev.right - 0.5; x <= next.left + 0.5; x += 0.1) {
          const at = document.elementFromPoint(x, y);
          // A `render` member is wrapped in a scope span that is the member's own box.
          const owner =
            at?.closest('[data-toolbar-focusable]') ??
            at?.closest('[data-toolbar-item-scope]')?.querySelector('[data-toolbar-focusable]') ??
            null;
          if (at !== el && owner !== focusables[i] && owner !== focusables[i + 1]) {
            return `${at?.tagName ?? 'nothing'} ${at?.className.slice(0, 50) ?? ''} at x=${x.toFixed(2)}`;
          }
        }
        return '';
      });
      const wrapperAttrs = ['role', 'aria-label', 'tabindex', 'data-toolbar-focusable'].filter(
        (a) => el.hasAttribute(a),
      );
      return {
        id,
        kind,
        members,
        gapHits,
        trackBg: getComputedStyle(el).backgroundColor,
        trackH: el.getBoundingClientRect().height,
        wrapperAttrs,
      };
    });
  });
}

const TRANSPARENT = 'rgba(0, 0, 0, 0)';

/** Assert every track on the page, returning how many switches and joined tracks were read. */
export async function expectTracks(
  page: Page,
  where: string,
  minTarget: number,
): Promise<{ switches: number; joined: number }> {
  const tracks = await readTracks(page);
  let switches = 0;
  let joined = 0;
  for (const track of tracks) {
    const here = `${where}: ${track.id}`;
    if (track.kind === 'switch') switches += 1;
    else joined += 1;
    expect(track.members.length, `${here} has fewer than two members`).toBeGreaterThan(1);

    // Plan view is a named group and must keep its role; every cluster wrapper must have none.
    if (track.id === 'plan-view') {
      expect(track.wrapperAttrs, `${here} lost its role or name`).toEqual(['role', 'aria-label']);
    } else {
      expect(track.wrapperAttrs, `${here} wrapper carries ${track.wrapperAttrs.join(',')}`).toEqual(
        [],
      );
    }

    // The track adds no height of its own: it is exactly as tall as its tallest member, so it cannot
    // grow the row (a padded track would, and the band's line counts are gated on that).
    const tallest = Math.max(...track.members.map((m) => m.h));
    expect(
      track.trackH,
      `${here}: the track is ${track.trackH} tall, its members ${tallest}`,
    ).toBeLessThan(tallest + 0.5);

    // The track is recessed: a real fill, not the band's own.
    expect(track.trackBg, `${here} track is not painted`).not.toBe(TRANSPARENT);

    for (const m of track.members) {
      expect(m.h, `${here} ${m.name} is ${m.h} tall`).toBeGreaterThanOrEqual(minTarget);
      expect(m.w, `${here} ${m.name} is ${m.w} wide`).toBeGreaterThanOrEqual(
        minTarget === 44 ? 44 : 24,
      );
      expect(m.leftEdgeHit, `${here} ${m.name}: 1 px inside its left edge is not it`).toBe(true);
      expect(m.rightEdgeHit, `${here} ${m.name}: 1 px inside its right edge is not it`).toBe(true);
      if (m.gapBefore !== null) {
        expect(m.gapBefore, `${here} ${m.name}: the join is not 1 px`).toBeGreaterThan(0.9);
        expect(m.gapBefore).toBeLessThan(1.1);
      }
    }
    expect(
      track.gapHits.filter(Boolean),
      `${here}: a point in a 1 px join belongs to something other than the track or its two members`,
    ).toEqual([]);

    if (track.kind === 'switch') {
      const chosen = track.members.filter((m) => m.pressed === 'true');
      expect(
        chosen.map((m) => m.name),
        `${here}: not exactly one chosen`,
      ).toHaveLength(1);
      const raised = chosen[0]!;
      const others = track.members.filter((m) => m.pressed !== 'true');
      // Never colour alone: a distinct fill AND an underline (a non-none shadow).
      expect(raised.bg, `${here}: the chosen member has no fill`).not.toBe(TRANSPARENT);
      // The base `selected` state already draws an underline, so "not none" would pass without the
      // track's own work. The track's composed value is a 2 px inset ring in `--field` (the raised
      // shape's inset) and the underline moved in by it.
      expect(raised.shadow, `${here}: the chosen member has no inset ring`).toContain(
        '0px 0px 0px 2px inset',
      );
      expect(raised.shadow, `${here}: the chosen member has no underline`).toContain(
        '0px -4px 0px 0px inset',
      );
      for (const o of others) {
        expect(o.bg, `${here}: ${o.name} is filled like the chosen one`).not.toBe(raised.bg);
        expect(o.shadow, `${here}: ${o.name} has the chosen one's shadow`).not.toBe(raised.shadow);
      }
    } else {
      // Joined: nothing is raised, so no member computes the raised shadow.
      for (const m of track.members) {
        expect(m.shadow, `${here}: ${m.name} is raised in a joined track`).not.toMatch(
          /inset 0px 0px 0px 2px/,
        );
      }
    }
  }
  return { switches, joined };
}

/** The deck's stops, by item id, in document order. */
export async function deckStops(page: Page): Promise<string[]> {
  return page
    .getByRole('toolbar', { name: 'Plan commands' })
    .locator('[data-toolbar-focusable]')
    .evaluateAll((els) => els.map((el) => el.getAttribute('data-toolbar-item') ?? ''));
}

/**
 * Lap the deck with the arrow keys and return the ids visited in order, stepping out of the search
 * field with ArrowDown (a single-line input keeps the horizontal keys for its caret, #189).
 */
export async function lapDeck(page: Page, stops: number): Promise<string[]> {
  const deck = page.getByRole('toolbar', { name: 'Plan commands' });
  await deck.locator('[data-toolbar-focusable]').first().focus();
  await page.keyboard.press('Home');
  const visited: string[] = [];
  for (let i = 0; i < stops; i += 1) {
    const here = await page.evaluate(() => {
      const active = document.activeElement;
      return {
        id: active?.closest('[data-toolbar-item]')?.getAttribute('data-toolbar-item') ?? '',
        onCluster: active?.hasAttribute('data-toolbar-cluster') ?? false,
        isField: active?.tagName === 'INPUT' || active?.tagName === 'TEXTAREA',
      };
    });
    expect(here.onCluster, 'a cluster wrapper took focus').toBe(false);
    visited.push(here.id);
    await page.keyboard.press(here.isField ? 'ArrowDown' : 'ArrowRight');
  }
  return visited;
}
