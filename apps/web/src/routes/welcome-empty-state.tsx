import { Link } from '@tanstack/react-router';
import { CalendarRange } from 'lucide-react';

import { buttonVariants } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';

/**
 * The neutral landing shown in the workspace region when no plan is selected (the
 * org home). Purely presentational — the org-home route owns the data and passes
 * `isNewOrg`. A centred welcome card sits over a lightweight, decorative ruler/TODAY
 * backdrop (a static evocation of the schedule canvas, **not** the interactive
 * `TsldPanel`), with an action appropriate to the org's state.
 */
export function WelcomeEmptyState({
  orgSlug,
  isNewOrg,
}: {
  orgSlug: string;
  isNewOrg: boolean;
}): React.ReactElement {
  return (
    <main className="relative flex min-h-0 flex-1 flex-col items-center justify-center overflow-hidden p-6">
      <ScheduleBackdrop />
      <Card className="relative z-10 max-w-md text-center">
        <CardHeader className="items-center gap-2">
          <span className="bg-primary/10 text-primary flex size-12 items-center justify-center rounded-full">
            <CalendarRange aria-hidden="true" className="size-6" />
          </span>
          <CardTitle className="text-xl">Welcome to SchedulePoint</CardTitle>
          <CardDescription>
            Select a plan from the{' '}
            <span className="text-foreground font-medium">Project Explorer</span> to view its
            schedule.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col items-center gap-3 text-sm">
          {isNewOrg ? (
            <>
              <p className="text-muted-foreground">
                New here? Add a client, then a project, then a plan.
              </p>
              <Link
                to="/orgs/$orgSlug/clients"
                params={{ orgSlug }}
                className={buttonVariants({ size: 'sm' })}
              >
                Add a client
              </Link>
            </>
          ) : (
            <Link
              to="/orgs/$orgSlug/clients"
              params={{ orgSlug }}
              className={buttonVariants({ variant: 'outline', size: 'sm' })}
            >
              Browse clients
            </Link>
          )}
        </CardContent>
      </Card>
    </main>
  );
}

/**
 * A static, decorative backdrop evoking the time-scaled canvas: faint vertical day
 * gridlines and a TODAY marker. Purely visual (`aria-hidden`) and token-driven, so it
 * costs nothing and adapts to light/dark — no canvas is mounted. The pixel steps below
 * are a deliberate, isolated exception to the spacing scale (this is freehand canvas
 * chrome, not layout).
 */
function ScheduleBackdrop(): React.ReactElement {
  return (
    <div aria-hidden="true" className="pointer-events-none absolute inset-0 select-none">
      <div
        className="absolute inset-0 opacity-50"
        style={{
          backgroundImage:
            'repeating-linear-gradient(to right, var(--color-border) 0, var(--color-border) 1px, transparent 1px, transparent 40px)',
        }}
      />
      <div className="absolute inset-y-0 left-10">
        <div
          className="bg-destructive absolute inset-y-0 w-px opacity-70"
          style={{
            maskImage: 'repeating-linear-gradient(to bottom, #000 0 6px, transparent 6px 12px)',
          }}
        />
        <span className="bg-destructive text-destructive-foreground absolute top-0 -left-5 rounded px-1.5 py-0.5 text-xs font-semibold tracking-wide">
          TODAY
        </span>
      </div>
    </div>
  );
}
