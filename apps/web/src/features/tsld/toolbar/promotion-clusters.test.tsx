import { cleanup, render, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { makeTsldToolbarContext } from './test-helpers';
import type { TsldToolbarContext } from './tsld-toolbar-context';
import { buildTsldToolbarItems } from './tsld-toolbar-items';

import { PLAN_MODE_SEGMENT_LABELS } from '@/components/layout/workspace/plan-workspace-toolbar';
import { Deck } from '@/components/ui/toolbar/Deck';
import { Toolbar } from '@/components/ui/toolbar/Toolbar';
import { splitByRow, type ToolbarItem } from '@/components/ui/toolbar/toolbar-registry';

vi.mock('@/config/env', async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  CANVAS_AUTHORING_ENABLED: true,
  CANVAS_LENSES_ENABLED: true,
  GANTT_VIEW_ENABLED: true,
}));

afterEach(cleanup);

/**
 * **The real registry's tracks: Colour, the Link "Type" set and Undo / Redo / Recent edits**
 * (toolbar-grid M2).
 *
 * A track is a picture and nothing else, so each case here reads something a reader or a screen
 * reader would notice if the picture had cost it: the **names** ("Colour by: X" and "Link: X", the
 * visible words inside them — WCAG 2.5.3), **exactly one** chosen Colour value, the **stops** and
 * their **order**. The unclustered deck is the control: the same registry with every `cluster`
 * stripped, so a difference between the two is the wrapper and nothing else.
 *
 * Verified red by dropping a member's `cluster` (`defineToolbar` refuses the half-set), by giving the
 * Colour track a second pressed member (the one-pressed case), and by listing Recent edits before
 * Redo (the order case).
 */
const WIDEST = { stage: 6, pointer: 'fine' } as const;

function deck(ctx: TsldToolbarContext, strip = false): void {
  const items: ToolbarItem<TsldToolbarContext>[] = buildTsldToolbarItems().map((item) => {
    if (!strip) return item;
    const { cluster: _cluster, ...rest } = item;
    return rest;
  });
  render(<Deck items={items} context={ctx} label="Plan commands" />);
}

const stops = (): { id: string; name: string }[] =>
  [...document.querySelectorAll('[data-toolbar-focusable]')].map((el) => ({
    id: el.getAttribute('data-toolbar-item') ?? '',
    name: el.getAttribute('aria-label') ?? el.textContent ?? '',
  }));

/** The printed label only: a button also holds `sr-only` spans (its reason and its description). */
const visibleText = (button: Element): string =>
  button.querySelector('span.truncate')?.textContent?.trim() ?? '';

const track = (id: string): HTMLElement => {
  const el = document.querySelector<HTMLElement>(`[data-toolbar-cluster="${id}"]`);
  if (!el) throw new Error(`no ${id} track on the deck`);
  return el;
};

describe('the Colour set is a switch track', () => {
  it('holds exactly the three values, with exactly one chosen and every name unchanged', () => {
    deck(makeTsldToolbarContext({ promotion: WIDEST, colourMode: 'totalFloat' }));
    const colour = track('colour-by');
    expect(colour).toHaveAttribute('data-toolbar-cluster-kind', 'switch');

    const members = [...colour.querySelectorAll('button')];
    expect(members.map((m) => m.getAttribute('aria-label'))).toEqual([
      'Colour by: Criticality',
      'Colour by: Total float',
      'Colour by: WBS group',
    ]);
    const pressed = members.filter((m) => m.getAttribute('aria-pressed') === 'true');
    expect(pressed.map((m) => m.getAttribute('aria-label'))).toEqual(['Colour by: Total float']);
  });

  it.each(['criticality', 'totalFloat', 'wbs'] as const)(
    'still has exactly one chosen value when it is %s',
    (mode) => {
      deck(makeTsldToolbarContext({ promotion: WIDEST, colourMode: mode }));
      const members = [...track('colour-by').querySelectorAll('button')];
      expect(members.filter((m) => m.getAttribute('aria-pressed') === 'true')).toHaveLength(1);
    },
  );

  it('prints each value inside its name (2.5.3) and draws the caption beside the track, not in it', () => {
    deck(makeTsldToolbarContext({ promotion: WIDEST }));
    const colour = track('colour-by');
    for (const m of colour.querySelectorAll('button')) {
      const visible = visibleText(m);
      expect(m.getAttribute('aria-label'), `"${visible}" is not in the name`).toContain(visible);
    }
    // The caption is a presentational render item, so it sits in the unit's first child (its scope
    // span), as the aria-hidden text, ahead of the track.
    const lead = colour.parentElement?.firstElementChild;
    expect(lead?.textContent).toBe('Colour');
    expect(lead?.querySelector('[aria-hidden="true"]')).not.toBeNull();
    expect(lead?.hasAttribute('data-toolbar-focusable')).toBe(false);
    expect(colour.contains(lead ?? null)).toBe(false);
  });
});

describe('the Link "Type" set is a joined track with nothing raised', () => {
  it('is joined, and each visible word is inside its accessible name (2.5.3)', () => {
    deck(makeTsldToolbarContext({ promotion: WIDEST }));
    const type = track('link-type');
    expect(type).toHaveAttribute('data-toolbar-cluster-kind', 'joined');
    // Not a switch: no member of a joined track is raised, and the track has no raised selector.
    expect(type.className).not.toContain('aria-pressed=true');
    const members = [...type.querySelectorAll('button')];
    expect(members.length).toBeGreaterThan(1);
    for (const m of members) {
      const visible = visibleText(m);
      expect(m.getAttribute('aria-label'), `"${visible}" is not in the name`).toMatch(/^Link: /);
      expect(m.getAttribute('aria-label')).toContain(visible);
    }
  });
});

describe('Undo, Redo and Recent edits are one joined track, in that order', () => {
  it('lists them as Undo, Redo, Recent edits in one track', () => {
    deck(makeTsldToolbarContext({ promotion: WIDEST }));
    const history = track('history');
    expect(history).toHaveAttribute('data-toolbar-cluster-kind', 'joined');
    expect(
      [...history.querySelectorAll('[data-toolbar-item]')].map((el) =>
        el.getAttribute('data-toolbar-item'),
      ),
    ).toEqual(['undo', 'redo', 'undo-history']);
  });

  it('keeps Recent edits a menu button with its own name', () => {
    deck(makeTsldToolbarContext({ promotion: WIDEST }));
    const trigger = within(track('history')).getByRole('button', { name: 'Recent edits' });
    expect(trigger).toHaveAttribute('aria-haspopup', 'menu');
    expect(trigger).toHaveAttribute('aria-expanded', 'false');
  });
});

describe('clustering changes the picture and nothing the keyboard or a screen reader meets', () => {
  it('keeps the same stops with the same names, except Redo now precedes Recent edits', () => {
    const ctx = makeTsldToolbarContext({ promotion: WIDEST });
    deck(ctx, true);
    const plain = stops();
    cleanup();
    deck(ctx);
    const clustered = stops();

    // The control still holds the registry order: the swap is a registry `order`, not the wrapper.
    expect(clustered.map((s) => s.id).sort()).toEqual(plain.map((s) => s.id).sort());
    expect(clustered.map((s) => s.id)).toEqual(plain.map((s) => s.id));
    expect(clustered.map((s) => s.name)).toEqual(plain.map((s) => s.name));
    const ids = clustered.map((s) => s.id);
    expect(ids.indexOf('redo')).toBe(ids.indexOf('undo') + 1);
    expect(ids.indexOf('undo-history')).toBe(ids.indexOf('redo') + 1);
  });

  it('puts no role, name or tab stop on any wrapper the clustering made', () => {
    deck(makeTsldToolbarContext({ promotion: WIDEST }));
    const tracks = document.querySelectorAll('[data-toolbar-cluster]');
    expect(tracks.length, 'the Colour, Link Type and history tracks').toBeGreaterThanOrEqual(3);
    for (const el of tracks) {
      for (const attr of ['role', 'aria-label', 'tabindex', 'data-toolbar-focusable']) {
        expect(el.hasAttribute(attr), `a track has ${attr}`).toBe(false);
      }
      // Where the track has a caption its unit is a second wrapper made by the same clustering.
      const unit = el.parentElement!;
      if (
        unit.getAttribute('role') !== 'group' &&
        unit.querySelector(':scope > [data-toolbar-item-scope]')
      ) {
        for (const attr of ['role', 'aria-label', 'tabindex', 'data-toolbar-focusable']) {
          expect(unit.hasAttribute(attr), `a unit has ${attr}`).toBe(false);
        }
      }
    }
    // The group names are the deck's own, unchanged.
    for (const name of ['View', 'Find', 'Panels', 'Author', 'Plan']) {
      expect(screen.getAllByRole('group', { name }).length).toBeGreaterThan(0);
    }
  });
});

describe('the header’s Diagram | Gantt group survives being a track (B2)', () => {
  it('is still the group named Plan view, with both members and one chosen', () => {
    const ctx = makeTsldToolbarContext({ planView: 'gantt' });
    render(
      <Toolbar
        items={splitByRow(buildTsldToolbarItems()).mode}
        context={ctx}
        label="Plan view"
        groupLabels={{ lens: 'Plan view' }}
        segmentLabels={PLAN_MODE_SEGMENT_LABELS}
      />,
    );
    const group = screen.getByRole('group', { name: 'Plan view' });
    const members = [...group.querySelectorAll('button')];
    expect(members.map((m) => m.textContent?.trim())).toEqual(['Diagram', 'Gantt']);
    expect(members.filter((m) => m.getAttribute('aria-pressed') === 'true')).toHaveLength(1);
    expect(group.className).toMatch(/(^|\s)bg-field(\s|$)/);
  });
});
