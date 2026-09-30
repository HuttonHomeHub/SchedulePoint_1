import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { axe } from 'vitest-axe';

import { makeTsldToolbarContext } from './test-helpers';
import type { TsldToolbarContext } from './tsld-toolbar-context';
import { buildTsldToolbarItems } from './tsld-toolbar-items';

import { Toolbar, splitByRow } from '@/components/ui/toolbar';

/**
 * **Apply levelled dates…** — the command's five shaded reasons, their order, and the one state in
 * which it runs (`docs/specs/apply-levelled-dates/` US-6, T2.1).
 *
 * The ORDER is what these tests exist for. Each reason is a separate fact and several can be true at
 * once, so the test sets two at a time and asserts which sentence wins: a reason list whose order
 * nobody pinned is a list a later edit reorders without anybody noticing.
 */
vi.mock('@/config/env', async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  CANVAS_AUTHORING_ENABLED: true,
}));

function ctx(over: Partial<TsldToolbarContext> = {}): TsldToolbarContext {
  return makeTsldToolbarContext({
    canEditSchedule: true,
    levelResources: true,
    levelledMoveCount: 3,
    scheduleStale: false,
    scheduleRefusal: () => null,
    ...over,
  });
}

function renderRow(context: TsldToolbarContext, authoringEnabled = true) {
  const rows = splitByRow(buildTsldToolbarItems());
  return render(
    <Toolbar
      items={rows.strip}
      context={context}
      label="Plan commands"
      authoringEnabled={authoringEnabled}
    />,
  );
}

const command = () => screen.getByRole('button', { name: /Apply levelled dates/ });

describe('the Apply levelled dates… command', () => {
  it('runs when the pen is held, levelling moved something and the schedule is current', () => {
    const requestApplyLevelling = vi.fn();
    renderRow(ctx({ requestApplyLevelling }));
    expect(command()).not.toHaveAttribute('aria-disabled', 'true');
    fireEvent.click(command());
    expect(requestApplyLevelling).toHaveBeenCalledOnce();
  });

  it('sits in the editing tools beside Arrange, pen-gated', () => {
    renderRow(ctx());
    const arrange = document.querySelector('[data-toolbar-item="auto-arrange"]');
    const apply = document.querySelector('[data-toolbar-item="apply-levelling"]');
    expect(arrange).not.toBeNull();
    expect(apply).not.toBeNull();
    expect(arrange?.nextElementSibling).toBe(apply);
  });

  it('is shaded, and does not run, without the pen — with the pen sentence', () => {
    const requestApplyLevelling = vi.fn();
    renderRow(
      ctx({
        canEditSchedule: false,
        requestApplyLevelling,
        scheduleRefusal: (action) => `Start editing to ${action}.`,
      }),
      false,
    );
    expect(command()).toHaveAttribute('aria-disabled', 'true');
    expect(command()).toHaveAccessibleDescription('Start editing to apply levelled dates.');
    fireEvent.click(command());
    expect(requestApplyLevelling).not.toHaveBeenCalled();
  });

  it('says the role cannot do it, for a reader the pen would not help', () => {
    renderRow(
      ctx({
        canEditSchedule: false,
        scheduleRefusal: (action) => `Your role cannot ${action}.`,
      }),
      false,
    );
    expect(command()).toHaveAccessibleDescription('Your role cannot apply levelled dates.');
  });

  it('says levelling is off when it is, and the plan setting outranks "moved nothing"', () => {
    renderRow(ctx({ levelResources: false, levelledMoveCount: 0 }));
    expect(command()).toHaveAttribute('aria-disabled', 'true');
    expect(command()).toHaveAccessibleDescription(
      'Resource levelling is off for this plan. Turn it on in Schedule settings.',
    );
  });

  it('does not send a reader to a setting they cannot change', () => {
    renderRow(ctx({ levelResources: false, canEditSchedule: false }));
    expect(command()).toHaveAccessibleDescription('Resource levelling is off for this plan');
  });

  it('says levelling moved nothing, and that outranks "waiting to recalculate"', () => {
    renderRow(ctx({ levelledMoveCount: 0, scheduleStale: true }));
    expect(command()).toHaveAttribute('aria-disabled', 'true');
    expect(command()).toHaveAccessibleDescription('Levelling hasn’t moved any bars');
  });

  it('says it is waiting for the schedule when the dates on screen are behind the plan', () => {
    renderRow(ctx({ scheduleStale: true }));
    expect(command()).toHaveAttribute('aria-disabled', 'true');
    expect(command()).toHaveAccessibleDescription('Waiting for the schedule to recalculate');
  });

  it('puts the pen and role sentences ahead of every plan fact', () => {
    renderRow(
      ctx({
        canEditSchedule: false,
        levelResources: false,
        levelledMoveCount: 0,
        scheduleStale: true,
        scheduleRefusal: () => 'Take the pen first.',
      }),
      false,
    );
    expect(command()).toHaveAccessibleDescription('Take the pen first.');
  });

  it('keeps a shaded command reachable by keyboard (ADR-0082)', () => {
    renderRow(ctx({ levelledMoveCount: 0 }));
    command().focus();
    expect(command()).toHaveFocus();
  });

  it('has no axe violations shaded or enabled', async () => {
    const enabled = renderRow(ctx());
    expect((await axe(enabled.container)).violations).toEqual([]);
    enabled.unmount();
    const shaded = renderRow(ctx({ levelledMoveCount: 0 }));
    expect((await axe(shaded.container)).violations).toEqual([]);
  });
});
