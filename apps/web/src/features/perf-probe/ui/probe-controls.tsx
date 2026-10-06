import { SCENARIOS, type ScenarioId, type ScenarioPreset } from '../model/scenarios';
import type { RunSize } from '../runner/run-probe';
import { describeDuration, estimateSweepSeconds } from '../sweep/sweep-duration';
import { sweepPlan } from '../sweep/sweep-plan';

import type { ProbeSweep } from './use-probe-sweep';

import { Button } from '@/components/ui/button';
import { Disclosure } from '@/components/ui/disclosure';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select } from '@/components/ui/select';

/**
 * The three controls an operator takes a reading with, and the selects behind "Measure one thing".
 *
 * Markup only: every piece of state is the sweep's (`useProbeSweep`), so this unmounts with the
 * folded box and takes nothing with it.
 */
export function ProbeControls({ sweep }: { sweep: ProbeSweep }): React.ReactElement {
  const {
    ids: { scenarioSelectId, presetSelectId, sizeSelectId, machineLabelId },
    scenarioId,
    setScenarioId,
    preset,
    setPreset,
    size,
    setSize,
    scenario,
    machineLabel,
    setMachineLabel,
    running,
    setConfirming,
    openerRef,
    runButtonRef,
  } = sweep;

  return (
    <>
      {/*
          **Three controls, in the order an operator needs them.**

          The primary one takes every reading the probe can take — which is what `docs/TECH_DEBT.md`
          #75 has been waiting a year for, and what nobody was going to assemble four presses at a
          time. The secondary one exists because two minutes is a real commitment and finding out
          the probe works here should not cost it. The three selects are still there and still work;
          they move behind a disclosure because "which of eight combinations do I want?" is the
          question an operator asks LAST, and the panel used to ask it first.
        */}
      <div className="flex flex-wrap items-center gap-3">
        <Button
          ref={runButtonRef}
          onClick={(event) => {
            if (running) return;
            openerRef.current = event.currentTarget;
            setConfirming('sweep');
          }}
          // `aria-disabled`, never the native attribute: a natively-disabled button is blurred to
          // `<body>` the instant it flips, and this one flips twice per run (ADR-0083, and the
          // ScopeSaveBar lesson re-learnt in ADR-0063 M6).
          aria-disabled={running}
          aria-busy={running}
          className="aria-disabled:pointer-events-none aria-disabled:opacity-50"
        >
          Run all measurements
        </Button>
        <Button
          variant="outline"
          onClick={(event) => {
            if (running) return;
            openerRef.current = event.currentTarget;
            setConfirming('check');
          }}
          aria-disabled={running}
          className="aria-disabled:pointer-events-none aria-disabled:opacity-50"
        >
          Check the probe works
        </Button>
        <span className="text-muted-foreground text-sm">
          {describeDuration(estimateSweepSeconds(sweepPlan(), 'full'))} for all four readings.
        </span>
      </div>

      {/*
          **A `Disclosure`, not a `<details>`** (staff console redesign M4). A `<summary>` was the last
          sub-heading treatment on the page that was neither the `SubSection` heading nor a control the
          rest of the console uses; the console's other folds (How to fix, Show all) are this button.
          `hidden`, because the selects are controls nobody describes into and invisible focusable
          controls would fail WCAG 2.4.7.
        */}
      <Disclosure label="Measure one thing" collapsed="hidden">
        <div className="flex flex-wrap items-end gap-4">
          <div className="flex max-w-full min-w-0 flex-col gap-1">
            <Label htmlFor={scenarioSelectId}>Measurement</Label>
            <Select
              id={scenarioSelectId}
              className="max-w-full"
              value={scenarioId}
              onChange={(e) => setScenarioId(e.target.value as ScenarioId)}
            >
              {SCENARIOS.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.label}
                </option>
              ))}
            </Select>
          </div>
          <div className="flex max-w-full min-w-0 flex-col gap-1">
            <Label htmlFor={presetSelectId}>Framing</Label>
            <Select
              id={presetSelectId}
              className="max-w-full"
              value={preset}
              onChange={(e) => setPreset(e.target.value as ScenarioPreset)}
            >
              <option value="week">Week — a working zoom</option>
              <option value="fit">Fit — the whole plan</option>
            </Select>
          </div>
          <div className="flex max-w-full min-w-0 flex-col gap-1">
            <Label htmlFor={sizeSelectId}>Length</Label>
            <Select
              id={sizeSelectId}
              className="max-w-full"
              value={size}
              onChange={(e) => setSize(e.target.value as RunSize)}
            >
              {/* Derived, not stated: the old constants said 25 s and 5 s for every shape, and
                a whole-plan framing is nearly twice the first. See `sweep-duration.ts`. */}
              <option value="full">
                Full measurement (
                {describeDuration(estimateSweepSeconds([{ scenario, preset }], 'full'))})
              </option>
              <option value="quick">
                Quick check (
                {describeDuration(estimateSweepSeconds([{ scenario, preset }], 'quick'))})
              </option>
            </Select>
          </div>
          <div className="flex max-w-full min-w-0 flex-col gap-1">
            <Label htmlFor={machineLabelId}>Machine (optional)</Label>
            {/* Insert-time only in v1, and the panel says so rather than offering an edit that does
              not exist: an editable note needs `updated_at` and a version column, which is a
              migration and a decision. */}
            <Input
              id={machineLabelId}
              value={machineLabel}
              onChange={(e) => setMachineLabel(e.target.value)}
              placeholder="the Dell, docked, on mains"
              maxLength={200}
            />
          </div>
          <Button
            variant="outline"
            onClick={(event) => {
              if (running) return;
              openerRef.current = event.currentTarget;
              setConfirming('one');
            }}
            aria-disabled={running}
            className="aria-disabled:pointer-events-none aria-disabled:opacity-50"
          >
            Run measurement
          </Button>
        </div>
        <p className="text-muted-foreground text-sm">{scenario.question}</p>
      </Disclosure>
    </>
  );
}
