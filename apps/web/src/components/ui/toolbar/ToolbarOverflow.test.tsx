import { fireEvent, render, screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import type { ResolvedToolbarItem } from './toolbar-registry';
import { ToolbarOverflow } from './ToolbarOverflow';

/**
 * **`ToolbarOverflow`'s disabled row** (ADR-0082), which had no test file at all.
 *
 * That absence is the finding, not an oversight to note in passing: the row used to be a bespoke
 * `<div role="menuitem" aria-disabled tabIndex={-1} title={reason}>` carrying two comments claiming
 * it was "focusable for AT with its reason" and "still an arrow-key stop in the menu". Both were
 * false — `Menu.itemsOf` filtered `aria-disabled` out of the roving set — so the focus ring it
 * carefully declared could never fire and its reason was reachable by hover alone. Nothing failed,
 * because nothing looked. Reverting the fix would still pass every other suite in the repository.
 *
 * So these assertions are deliberately about the things the old markup got wrong: that the row is a
 * real arrow-key stop, that its reason is a **description** rather than part of the name, and that
 * reaching it does not fire the command.
 *
 * **Which assertion actually carries the weight**, established by running this file against the
 * pre-ADR-0082 code rather than assuming: only *"is an arrow-key stop"* goes red. The description
 * assertion passes either way, because `title` also contributes to the accessible description under
 * the accname spec — so it guards against a future change dropping the reason entirely, but it
 * cannot tell a tooltip from a linked description. Recorded here so nobody later reads five green
 * assertions as five independent proofs.
 */

interface Ctx {
  ok: boolean;
}

function resolved(over: Partial<ResolvedToolbarItem<Ctx>> = {}): ResolvedToolbarItem<Ctx> {
  return {
    item: {
      id: 'add',
      group: 'tools',
      tier: 1,
      order: 0,
      label: 'Add activity',
      onActivate: () => {},
    },
    enabled: true,
    active: false,
    busy: false,
    disabledReason: undefined,
    icon: null,
    ...over,
  };
}

/** The same names {@link Toolbar} resolves; the overflow renders one section heading per group. */
const GROUP_LABELS = {
  frame: 'Navigate',
  lens: 'Display',
  find: 'Find',
  tools: 'Author',
  object: 'Plan actions',
  output: 'Deliver',
  help: 'Help',
};

function openOverflow(items: ResolvedToolbarItem<Ctx>[]): HTMLElement {
  render(
    <ToolbarOverflow
      items={items}
      context={{ ok: true }}
      groupLabels={GROUP_LABELS}
      tabIndex={0}
    />,
  );
  fireEvent.click(screen.getByRole('button', { name: /more/i }));
  return screen.getByRole('menu');
}

const SHUT = resolved({
  enabled: false,
  disabledReason: 'Start editing to add activities',
});
const LIVE = resolved({
  item: {
    id: 'fit',
    group: 'frame',
    tier: 1,
    order: 0,
    label: 'Fit to window',
    onActivate: () => {},
  },
});

describe('ToolbarOverflow — the disabled row (ADR-0082)', () => {
  it('renders a shut command as a real menu item, shaded rather than dropped', () => {
    const item = within(openOverflow([SHUT])).getByRole('menuitem', { name: 'Add activity' });
    expect(item).toHaveAttribute('aria-disabled', 'true');
  });

  it('links the reason as a DESCRIPTION, leaving the name alone', () => {
    const item = within(openOverflow([SHUT])).getByRole('menuitem', { name: 'Add activity' });
    // The name identifies the control; the reason explains its state. Folding the reason into the
    // name is what `ToolbarButton` fixed one primitive along, and thirteen tests caught it there.
    expect(item).toHaveAccessibleName('Add activity');
    expect(item).toHaveAccessibleDescription('Start editing to add activities');
  });

  it('is an arrow-key stop — the claim the old bespoke markup made and could not keep', () => {
    const menu = openOverflow([LIVE, SHUT]);
    const shut = within(menu).getByRole('menuitem', { name: 'Add activity' });
    // Opening focuses the first item; one ArrowDown must land on the shaded one rather than
    // skipping past it, which is the whole reason its reason is reachable at all.
    fireEvent.keyDown(menu, { key: 'ArrowDown' });
    expect(shut).toHaveFocus();
  });

  it('does not fire the command when the shaded row is clicked', () => {
    let fired = false;
    const menu = openOverflow([
      resolved({
        enabled: false,
        disabledReason: 'Start editing to add activities',
        item: {
          id: 'add',
          group: 'tools',
          tier: 1,
          order: 0,
          label: 'Add activity',
          onActivate: () => {
            fired = true;
          },
        },
      }),
    ]);
    fireEvent.click(within(menu).getByRole('menuitem', { name: 'Add activity' }));
    expect(fired).toBe(false);
  });

  it('marks an in-flight command aria-busy', () => {
    const menu = openOverflow([resolved({ enabled: false, busy: true })]);
    expect(within(menu).getByRole('menuitem', { name: 'Add activity' })).toHaveAttribute(
      'aria-busy',
      'true',
    );
  });

  it('still activates an enabled command', () => {
    let fired = false;
    const menu = openOverflow([
      resolved({
        item: {
          id: 'fit',
          group: 'frame',
          tier: 1,
          order: 0,
          label: 'Fit to window',
          onActivate: () => {
            fired = true;
          },
        },
      }),
    ]);
    fireEvent.click(within(menu).getByRole('menuitem', { name: 'Fit to window' }));
    expect(fired).toBe(true);
  });
});

/**
 * **The sectioning** (ADR-0090 M2-T6). `LIVE` sits in `frame` and `SHUT` in `tools`, so a two-item
 * menu spans two groups — which is the smallest case that can tell a section break from a heading
 * printed unconditionally.
 *
 * **Verified red by running it** against a build with the section render removed — the file's own
 * standard, one describe block up. Two of the three go red; the roving-focus one passes there
 * **vacuously**, because with no headings rendered there is nothing that could be in the roving set.
 * It is kept regardless, and it is the assertion that matters going forward: it is the only one that
 * fails if a future change renders a section as something `Menu.itemsOf` matches, which would put a
 * non-actionable heading in the arrow-key order — a trap in a list of commands. Recorded so nobody
 * reads three green assertions as three independent proofs.
 */
describe('ToolbarOverflow — group sections (ADR-0090 M2-T6)', () => {
  it('breaks the list at each group, under the names the bar uses', () => {
    const menu = openOverflow([LIVE, SHUT]);
    expect(
      within(menu)
        .getAllByRole('separator')
        .map((n) => n.getAttribute('aria-label')),
    ).toEqual(['Navigate', 'Author']);
  });

  it('prints one heading per group, not one per item', () => {
    const second = resolved({
      item: {
        id: 'today',
        group: 'frame',
        tier: 1,
        order: 1,
        label: 'Today',
        onActivate: () => {},
      },
    });
    const menu = openOverflow([LIVE, second, SHUT]);
    expect(within(menu).getAllByRole('separator')).toHaveLength(2);
  });

  it('leaves the headings out of the roving set', () => {
    const menu = openOverflow([LIVE, SHUT]);
    // Opening focuses the first ITEM. One ArrowDown crosses a section break and must land on the
    // next command — a heading in the roving order would swallow the keystroke.
    fireEvent.keyDown(menu, { key: 'ArrowDown' });
    expect(within(menu).getByRole('menuitem', { name: 'Add activity' })).toHaveFocus();
  });
});

/**
 * **Toggle state in the menu, and the difference between a toggle and a segment** (ADR-0090 M2/M5).
 *
 * An item that declares `isActive` is a toggle, and on the bar its `ToolbarButton` carries
 * `aria-pressed`. Demoted into the `⋯` it used to become a plain `menuitem` and announce nothing, so
 * a screen-reader user could not tell whether Float paths was open.
 *
 * The M5 component gate then found the fix applied one step too broadly: `checked` went on **every**
 * `isActive` item, including the two mutually-exclusive segment pairs (`Early | Visual`,
 * `Diagram | Gantt`), which D3 guarantees demote together. Two `menuitemcheckbox`es say a planner can
 * hold both Early and Visual at once. `demotionGroup` is what makes them one unit, so it is the
 * discriminator.
 *
 * **Verified red**: with the discriminator removed, the segment assertions fail on the role.
 */
describe('ToolbarOverflow — toggles vs segments (ADR-0090 M5)', () => {
  const toggle = resolved({
    active: true,
    item: {
      id: 'float-paths',
      group: 'lens',
      tier: 3,
      order: 0,
      label: 'Float paths',
      isActive: () => true,
      onActivate: () => {},
    },
  });
  const segment = (id: string, label: string, active: boolean): ResolvedToolbarItem<Ctx> =>
    resolved({
      active,
      item: {
        id,
        group: 'lens',
        tier: 1,
        order: 0,
        label,
        demotionGroup: 'scheduling-mode',
        isActive: () => active,
        onActivate: () => {},
      },
    });

  it('announces an independent toggle as a checkbox, with its state', () => {
    const menu = openOverflow([toggle]);
    const item = within(menu).getByRole('menuitemcheckbox', { name: 'Float paths' });
    expect(item).toHaveAttribute('aria-checked', 'true');
  });

  it('announces a segment pair as radios — one choice, not two switches', () => {
    const menu = openOverflow([
      segment('mode-early', 'Early mode', true),
      segment('mode-visual', 'Visual mode', false),
    ]);
    expect(within(menu).getByRole('menuitemradio', { name: 'Early mode' })).toHaveAttribute(
      'aria-checked',
      'true',
    );
    expect(within(menu).getByRole('menuitemradio', { name: 'Visual mode' })).toHaveAttribute(
      'aria-checked',
      'false',
    );
    // The failure this prevents: two checkboxes read as "you may have both".
    expect(within(menu).queryAllByRole('menuitemcheckbox')).toHaveLength(0);
  });

  it('leaves an item with no isActive a plain menuitem', () => {
    const menu = openOverflow([LIVE]);
    expect(within(menu).getByRole('menuitem', { name: 'Fit to window' })).toBeInTheDocument();
  });
});
