import { zodResolver } from '@hookform/resolvers/zod';
import { CROSS_PLAN_DEPENDENCY_CONFLICT_MESSAGES, type ActivitySummary } from '@repo/types';
import { useQuery } from '@tanstack/react-query';
import { useEffect } from 'react';
import { useForm, useWatch } from 'react-hook-form';

import { useCreateCrossPlanLink, useOtherPlanActivities } from '../api/use-cross-plan-dependencies';
import {
  CROSS_PLAN_LAG_CALENDAR_DISPLAY_ORDER,
  CROSS_PLAN_LAG_CALENDAR_HINT,
  CROSS_PLAN_LAG_CALENDAR_LABELS,
  CROSS_PLAN_TYPES,
  CROSS_PLAN_TYPE_LABELS,
  crossPlanLagFieldLabel,
  crossPlanLinkFormSchema,
  type CrossPlanLinkFormValues,
} from '../schemas/cross-plan-schemas';

import { useAnnounce } from '@/components/ui/announcer';
import { Button } from '@/components/ui/button';
import { Dialog } from '@/components/ui/dialog';
import { FormErrorSummary, TextField } from '@/components/ui/form';
import { Label } from '@/components/ui/label';
import { Select } from '@/components/ui/select';
import { ApiFetchError } from '@/lib/api/client';
import {
  clientsQueryOptions,
  plansQueryOptions,
  projectsQueryOptions,
} from '@/lib/query/hierarchy-queries';

/**
 * Map a server-side create rejection to the shared cross-plan conflict copy (ADR-0045 N30/N31/N33),
 * so the client pre-check and the server fallback read in **one voice** (the API throws these exact
 * strings, but keying off the stable `code` keeps the message identical even if the wire copy drifts).
 * Falls back to the server message for anything else.
 */
function crossPlanErrorMessage(error: unknown): string {
  if (error instanceof ApiFetchError) {
    switch (error.error.code) {
      case 'CROSS_PLAN_CYCLE_DETECTED':
        return CROSS_PLAN_DEPENDENCY_CONFLICT_MESSAGES.CYCLE;
      case 'DUPLICATE_CROSS_PLAN_DEPENDENCY':
        return CROSS_PLAN_DEPENDENCY_CONFLICT_MESSAGES.DUPLICATE;
      case 'CROSS_PLAN_SAME_PLAN':
        return CROSS_PLAN_DEPENDENCY_CONFLICT_MESSAGES.SAME_PLAN;
      default:
        return error.message;
    }
  }
  return error instanceof Error ? error.message : 'Something went wrong. Please try again.';
}

const DEFAULT_VALUES: CrossPlanLinkFormValues = {
  clientId: '',
  projectId: '',
  predecessorPlanId: '',
  predecessorActivityId: '',
  type: 'FS',
  lagDays: 0,
  lagCalendar: 'PROJECT_DEFAULT',
};

/**
 * Add a **live cross-plan link** from the activity panel: choose an upstream activity in ANOTHER plan
 * of the org (a client → project → plan → activity cascade — the org-scoped endpoint picker), then
 * the FS/SS/FF/SF type + signed lag + lag calendar (mirroring the intra-plan dependency editor). The
 * `anchor` is always the **successor** (the edge's home, ADR-0045 CQ-2); the chosen activity is the
 * predecessor. Same-plan (N31) is caught client-side before the write; cycle (N30) / duplicate (N33)
 * come back from the server and surface the shared conflict copy. `anchor` is optional so the dialog
 * stays mounted (toggled by `open`) for native focus-restore.
 */
export function AddCrossPlanLinkDialog({
  orgSlug,
  currentPlanId,
  anchor,
  open,
  onClose,
}: {
  orgSlug: string;
  /** The successor plan — excluded from the picker so a same-plan link (N31) can't be chosen. */
  currentPlanId: string;
  anchor?: ActivitySummary;
  open: boolean;
  onClose: () => void;
}): React.ReactElement {
  const create = useCreateCrossPlanLink(orgSlug);
  const announce = useAnnounce();

  const {
    register,
    handleSubmit,
    reset,
    setValue,
    setError,
    control,
    formState: { errors },
  } = useForm<CrossPlanLinkFormValues>({
    resolver: zodResolver(crossPlanLinkFormSchema),
    defaultValues: DEFAULT_VALUES,
  });

  const clientId = useWatch({ control, name: 'clientId' });
  const projectId = useWatch({ control, name: 'projectId' });
  const predecessorPlanId = useWatch({ control, name: 'predecessorPlanId' });
  const lagCalendar = useWatch({ control, name: 'lagCalendar' });

  useEffect(() => {
    if (open) {
      reset(DEFAULT_VALUES);
      create.reset();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- reset only on (re)open
  }, [open, anchor?.id]);

  const clients = useQuery({ ...clientsQueryOptions(orgSlug), enabled: open });
  const projects = useQuery({
    ...projectsQueryOptions(orgSlug, clientId),
    enabled: open && clientId !== '',
  });
  const plans = useQuery({
    ...plansQueryOptions(orgSlug, projectId),
    enabled: open && projectId !== '',
  });
  const activities = useOtherPlanActivities(orgSlug, predecessorPlanId, open);

  // Exclude the successor's own plan — a same-plan link is N31 (use an intra-plan dependency).
  const planOptions = (plans.data ?? []).filter((plan) => plan.id !== currentPlanId);

  const clientReg = register('clientId');
  const projectReg = register('projectId');
  const planReg = register('predecessorPlanId');

  const onSubmit = handleSubmit((values) => {
    if (!anchor) return;
    // Defensive N31 (the picker already excludes the current plan): never submit a same-plan link.
    if (values.predecessorPlanId === currentPlanId) {
      setError('predecessorPlanId', {
        type: 'manual',
        message: CROSS_PLAN_DEPENDENCY_CONFLICT_MESSAGES.SAME_PLAN,
      });
      return;
    }
    create.mutate(
      {
        predecessorActivityId: values.predecessorActivityId,
        successorActivityId: anchor.id,
        type: values.type,
        lagDays: values.lagDays,
        lagCalendar: values.lagCalendar,
      },
      {
        onSuccess: () => {
          announce(`Cross-plan link added to “${anchor.name}”.`);
          onClose();
        },
      },
    );
  });

  return (
    <Dialog
      open={open}
      onClose={onClose}
      size="lg"
      title="Add cross-plan link"
      description={
        anchor
          ? `Choose an activity in another plan that must gate “${anchor.name}”. Its computed dates ` +
            `will drive this activity when you run a programme recalculate.`
          : ''
      }
    >
      <form noValidate onSubmit={(event) => void onSubmit(event)} className="flex flex-col gap-4">
        <FormErrorSummary errors={errors} />
        {create.isError ? (
          <p role="alert" className="text-destructive-text text-sm">
            {crossPlanErrorMessage(create.error)}
          </p>
        ) : null}

        {/* The endpoint picker: narrow down to an activity in another plan, client → project → plan
            → activity. Each level clears the levels below it so a stale leaf can't be submitted. */}
        <fieldset className="border-border m-0 flex flex-col gap-4 rounded-lg border p-4">
          <legend className="px-1 text-sm font-medium">Upstream activity (another plan)</legend>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="cross-plan-client">Client</Label>
            <Select
              id="cross-plan-client"
              aria-invalid={errors.clientId ? true : undefined}
              aria-describedby={errors.clientId ? 'cross-plan-client-error' : undefined}
              {...clientReg}
              onChange={(event) => {
                void clientReg.onChange(event);
                setValue('projectId', '');
                setValue('predecessorPlanId', '');
                setValue('predecessorActivityId', '');
              }}
            >
              <option value="" disabled>
                {clients.isPending ? 'Loading clients…' : 'Choose a client…'}
              </option>
              {(clients.data ?? []).map((client) => (
                <option key={client.id} value={client.id}>
                  {client.name}
                </option>
              ))}
            </Select>
            {errors.clientId?.message ? (
              <p id="cross-plan-client-error" className="text-destructive-text text-sm">
                {errors.clientId.message}
              </p>
            ) : clients.isError ? (
              <p className="text-destructive-text text-sm">
                Couldn’t load clients. Please try again.
              </p>
            ) : null}
          </div>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="cross-plan-project">Project</Label>
            <Select
              id="cross-plan-project"
              disabled={clientId === ''}
              aria-invalid={errors.projectId ? true : undefined}
              aria-describedby={errors.projectId ? 'cross-plan-project-error' : undefined}
              {...projectReg}
              onChange={(event) => {
                void projectReg.onChange(event);
                setValue('predecessorPlanId', '');
                setValue('predecessorActivityId', '');
              }}
            >
              <option value="" disabled>
                {projects.isPending && clientId !== '' ? 'Loading projects…' : 'Choose a project…'}
              </option>
              {(projects.data ?? []).map((project) => (
                <option key={project.id} value={project.id}>
                  {project.name}
                </option>
              ))}
            </Select>
            {errors.projectId?.message ? (
              <p id="cross-plan-project-error" className="text-destructive-text text-sm">
                {errors.projectId.message}
              </p>
            ) : null}
          </div>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="cross-plan-plan">Plan</Label>
            <Select
              id="cross-plan-plan"
              disabled={projectId === ''}
              aria-invalid={errors.predecessorPlanId ? true : undefined}
              aria-describedby={errors.predecessorPlanId ? 'cross-plan-plan-error' : undefined}
              {...planReg}
              onChange={(event) => {
                void planReg.onChange(event);
                setValue('predecessorActivityId', '');
              }}
            >
              <option value="" disabled>
                {plans.isPending && projectId !== '' ? 'Loading plans…' : 'Choose a plan…'}
              </option>
              {planOptions.map((plan) => (
                <option key={plan.id} value={plan.id}>
                  {plan.name}
                </option>
              ))}
            </Select>
            {errors.predecessorPlanId?.message ? (
              <p id="cross-plan-plan-error" className="text-destructive-text text-sm">
                {errors.predecessorPlanId.message}
              </p>
            ) : projectId !== '' && !plans.isPending && planOptions.length === 0 ? (
              <p className="text-muted-foreground text-sm">
                No other plans in this project to link to.
              </p>
            ) : null}
          </div>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="cross-plan-activity">Activity</Label>
            <Select
              id="cross-plan-activity"
              disabled={predecessorPlanId === ''}
              aria-invalid={errors.predecessorActivityId ? true : undefined}
              aria-describedby={
                errors.predecessorActivityId ? 'cross-plan-activity-error' : undefined
              }
              {...register('predecessorActivityId')}
            >
              <option value="" disabled>
                {activities.isPending && predecessorPlanId !== ''
                  ? 'Loading activities…'
                  : 'Choose an activity…'}
              </option>
              {(activities.data ?? []).map((activity) => (
                <option key={activity.id} value={activity.id}>
                  {activity.code ? `${activity.code} — ${activity.name}` : activity.name}
                </option>
              ))}
            </Select>
            {errors.predecessorActivityId?.message ? (
              <p id="cross-plan-activity-error" className="text-destructive-text text-sm">
                {errors.predecessorActivityId.message}
              </p>
            ) : null}
          </div>
        </fieldset>

        <div className="flex flex-col gap-1.5">
          <Label htmlFor="cross-plan-type">Type</Label>
          <Select id="cross-plan-type" {...register('type')}>
            {CROSS_PLAN_TYPES.map((value) => (
              <option key={value} value={value}>
                {CROSS_PLAN_TYPE_LABELS[value]}
              </option>
            ))}
          </Select>
        </div>

        <div className="flex flex-col gap-1.5">
          <Label htmlFor="cross-plan-lag-calendar">Lag calendar</Label>
          <Select
            id="cross-plan-lag-calendar"
            aria-describedby="cross-plan-lag-calendar-hint"
            {...register('lagCalendar')}
          >
            {CROSS_PLAN_LAG_CALENDAR_DISPLAY_ORDER.map((value) => (
              <option key={value} value={value}>
                {CROSS_PLAN_LAG_CALENDAR_LABELS[value]}
              </option>
            ))}
          </Select>
          <p id="cross-plan-lag-calendar-hint" className="text-muted-foreground text-sm">
            {CROSS_PLAN_LAG_CALENDAR_HINT}
          </p>
        </div>

        <TextField
          label={crossPlanLagFieldLabel(lagCalendar)}
          type="number"
          error={errors.lagDays?.message}
          {...register('lagDays', { valueAsNumber: true })}
        />

        <div className="flex justify-end gap-2">
          <Button type="button" variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" disabled={create.isPending} aria-busy={create.isPending}>
            {create.isPending ? 'Saving…' : 'Add cross-plan link'}
          </Button>
        </div>
      </form>
    </Dialog>
  );
}
