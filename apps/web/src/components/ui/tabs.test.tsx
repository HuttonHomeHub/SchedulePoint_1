import { fireEvent, render, screen } from '@testing-library/react';
import { useState } from 'react';
import { describe, expect, it } from 'vitest';
import { axe } from 'vitest-axe';

import { Tabs, type TabDescriptor } from '@/components/ui/tabs';

type Key = 'general' | 'scheduling' | 'progress';

const TABS: ReadonlyArray<TabDescriptor<Key>> = [
  { id: 'general', label: 'General' },
  { id: 'scheduling', label: 'Scheduling' },
  { id: 'progress', label: 'Progress' },
];

function Harness({
  initial = 'general',
  tabs = TABS,
  orientation,
}: {
  initial?: Key;
  tabs?: ReadonlyArray<TabDescriptor<Key>>;
  orientation?: 'horizontal' | 'vertical';
}): React.ReactElement {
  const [active, setActive] = useState<Key>(initial);
  return (
    <Tabs
      label="Activity sections"
      tabs={tabs}
      active={active}
      onChange={setActive}
      {...(orientation ? { orientation } : {})}
    >
      {(current) => <p>Panel for {current}</p>}
    </Tabs>
  );
}

/** The selected tab is the only tab stop, so it is where a keyboard user always lands. */
function selectedTab(): HTMLElement {
  const tab = screen.getAllByRole('tab').find((el) => el.getAttribute('aria-selected') === 'true');
  if (!tab) throw new Error('no tab is selected');
  return tab;
}

describe('Tabs', () => {
  it('is a named tablist with exactly one selected tab', () => {
    render(<Harness />);
    expect(screen.getByRole('tablist')).toHaveAttribute('aria-label', 'Activity sections');
    expect(screen.getAllByRole('tab')).toHaveLength(3);
    expect(
      screen.getAllByRole('tab').filter((el) => el.getAttribute('aria-selected') === 'true'),
    ).toHaveLength(1);
    expect(selectedTab()).toHaveAccessibleName('General');
  });

  it('renders only the active panel, from the render prop', () => {
    render(<Harness initial="scheduling" />);
    expect(screen.getAllByRole('tabpanel')).toHaveLength(1);
    expect(screen.getByRole('tabpanel')).toHaveTextContent('Panel for scheduling');
  });

  describe('roving tabindex', () => {
    it('gives the selected tab tabIndex 0 and every other tab -1', () => {
      render(<Harness initial="scheduling" />);
      const [general, scheduling, progress] = screen.getAllByRole('tab');
      expect(general).toHaveAttribute('tabindex', '-1');
      expect(scheduling).toHaveAttribute('tabindex', '0');
      expect(progress).toHaveAttribute('tabindex', '-1');
    });

    it('moves the single tab stop with the selection', () => {
      render(<Harness />);
      fireEvent.click(screen.getByRole('tab', { name: 'Progress' }));
      expect(screen.getByRole('tab', { name: 'General' })).toHaveAttribute('tabindex', '-1');
      expect(screen.getByRole('tab', { name: 'Progress' })).toHaveAttribute('tabindex', '0');
    });
  });

  describe('keyboard (automatic activation)', () => {
    it('ArrowRight selects and focuses the next tab', () => {
      render(<Harness />);
      fireEvent.keyDown(selectedTab(), { key: 'ArrowRight' });
      expect(selectedTab()).toHaveAccessibleName('Scheduling');
      expect(selectedTab()).toHaveFocus();
    });

    it('ArrowLeft selects the previous tab', () => {
      render(<Harness initial="scheduling" />);
      fireEvent.keyDown(selectedTab(), { key: 'ArrowLeft' });
      expect(selectedTab()).toHaveAccessibleName('General');
    });

    it('wraps at both ends', () => {
      render(<Harness />);
      // Left from the first wraps to the last…
      fireEvent.keyDown(selectedTab(), { key: 'ArrowLeft' });
      expect(selectedTab()).toHaveAccessibleName('Progress');
      // …and right from the last wraps back to the first.
      fireEvent.keyDown(selectedTab(), { key: 'ArrowRight' });
      expect(selectedTab()).toHaveAccessibleName('General');
    });

    it('Home and End jump to the first and last tab', () => {
      render(<Harness initial="scheduling" />);
      fireEvent.keyDown(selectedTab(), { key: 'End' });
      expect(selectedTab()).toHaveAccessibleName('Progress');
      fireEvent.keyDown(selectedTab(), { key: 'Home' });
      expect(selectedTab()).toHaveAccessibleName('General');
    });

    it('leaves unrelated keys to the browser', () => {
      render(<Harness />);
      fireEvent.keyDown(selectedTab(), { key: 'a' });
      expect(selectedTab()).toHaveAccessibleName('General');
    });
  });

  describe('aria wiring', () => {
    it('points aria-controls at the rendered panel and aria-labelledby back at the tab', () => {
      render(<Harness />);
      const tab = selectedTab();
      const panel = screen.getByRole('tabpanel');
      expect(tab.getAttribute('aria-controls')).toBe(panel.id);
      expect(panel.getAttribute('aria-labelledby')).toBe(tab.id);
    });

    it('does not share ids between two mounted instances', () => {
      render(
        <>
          <Harness />
          <Harness />
        </>,
      );
      const ids = screen.getAllByRole('tab').map((el) => el.id);
      expect(new Set(ids).size).toBe(ids.length);
      const panelIds = screen.getAllByRole('tabpanel').map((el) => el.id);
      expect(new Set(panelIds).size).toBe(panelIds.length);
    });

    // The panel is a scroll container, so it must be reachable by keyboard even when its content
    // is focusable (WCAG 2.1.1) — a deliberate departure from the APG's narrower guidance.
    it('makes the panel a tab stop', () => {
      render(<Harness />);
      expect(screen.getByRole('tabpanel')).toHaveAttribute('tabindex', '0');
    });
  });

  describe('markers', () => {
    const marked: ReadonlyArray<TabDescriptor<Key>> = [
      { id: 'general', label: 'General' },
      {
        id: 'scheduling',
        label: 'Scheduling',
        marker: { kind: 'count', count: 3, label: '3 problems' },
      },
      { id: 'progress', label: 'Progress', marker: { kind: 'dot', label: 'unsaved changes' } },
    ];

    it('joins a counted marker to the tab’s accessible name, never colour alone', () => {
      render(<Harness tabs={marked} />);
      // The count is visible text…
      expect(screen.getByRole('tab', { name: /Scheduling/ })).toHaveTextContent('3');
      // …and it reaches assistive technology as words, not as a styling cue (WCAG 1.4.1).
      expect(screen.getByRole('tab', { name: 'Scheduling, 3 problems' })).toBeInTheDocument();
    });

    it('supports a countless marker (the dirty dot) with a worded name', () => {
      render(<Harness tabs={marked} />);
      expect(screen.getByRole('tab', { name: 'Progress, unsaved changes' })).toBeInTheDocument();
    });

    it('leaves an unmarked tab’s name exactly its label (WCAG 2.5.3)', () => {
      render(<Harness tabs={marked} />);
      expect(screen.getByRole('tab', { name: 'General' })).toBeInTheDocument();
    });

    it('words a locked scope rather than leaving it to a glyph', () => {
      // The rail's whole reason for existing is that a reader learns which scopes are shut before
      // clicking into them. A padlock nobody can hear would tell half the users nothing.
      render(
        <Harness
          tabs={[
            { id: 'general', label: 'General', marker: { kind: 'locked', label: 'read-only' } },
            { id: 'scheduling', label: 'Scheduling' },
            { id: 'progress', label: 'Progress' },
          ]}
        />,
      );
      expect(screen.getByRole('tab', { name: 'General, read-only' })).toBeInTheDocument();
    });
  });

  describe('vertical orientation', () => {
    const vertical = (): void => {
      render(<Harness orientation="vertical" />);
    };

    it('declares its axis so assistive tech announces the right arrow keys', () => {
      vertical();
      expect(screen.getByRole('tablist')).toHaveAttribute('aria-orientation', 'vertical');
    });

    it('moves on Down/Up', () => {
      vertical();
      fireEvent.keyDown(selectedTab(), { key: 'ArrowDown' });
      expect(selectedTab()).toHaveAccessibleName('Scheduling');
      fireEvent.keyDown(selectedTab(), { key: 'ArrowUp' });
      expect(selectedTab()).toHaveAccessibleName('General');
    });

    it('ignores Left/Right, leaving them to the panel’s own controls', () => {
      // A rail that also answered the horizontal arrows would swallow keystrokes meant for a text
      // field or a slider inside the pane beside it.
      vertical();
      fireEvent.keyDown(selectedTab(), { key: 'ArrowRight' });
      expect(selectedTab()).toHaveAccessibleName('General');
    });

    it('has no axe violations', async () => {
      const { container } = render(<Harness orientation="vertical" />);
      expect((await axe(container)).violations).toEqual([]);
    });
  });

  it('has no axe violations', async () => {
    const { container } = render(<Harness />);
    expect((await axe(container)).violations).toEqual([]);
  });
});
