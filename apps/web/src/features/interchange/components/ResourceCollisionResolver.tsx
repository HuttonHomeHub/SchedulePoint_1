import type { ResourceCollision, ResourceCollisionResolution } from '@repo/interchange';

import { Badge } from '@/components/ui/badge';
import { SegmentedControl } from '@/components/ui/segmented-control';

/**
 * The **resource-name collisions** an import cannot decide for itself, one question per row.
 *
 * A source resource whose code matches a library row **is** that row and never appears here — a code
 * is an identifier, and matching one is not a guess. What lands here is the narrower, genuinely
 * ambiguous case: the code matches nothing while the name is already taken. Both answers change real
 * data, which is why there is no default and why the copy says what each one costs. Reuse binds the
 * import to the row already in the library and drops the file's own rate and calendar for it; a
 * separate copy keeps them, but splits one crew's demand across two library rows — and levelling,
 * over-allocation and Earned Value all read from one org-global pool.
 *
 * Rendered only when the dry-run reported at least one; the array is absent when there are none.
 */
export function ResourceCollisionResolver({
  collisions,
  resolutions,
  onChange,
}: {
  collisions: readonly ResourceCollision[];
  /** The answers so far, keyed by `resourceKey`. A key absent from this map is unanswered. */
  resolutions: Readonly<Record<string, ResourceCollisionResolution>>;
  onChange: (resourceKey: string, resolution: ResourceCollisionResolution) => void;
}): React.ReactElement {
  return (
    <ul className="flex list-none flex-col gap-3 p-0">
      {collisions.map((collision) => {
        const answered = resolutions[collision.resourceKey];
        return (
          <li
            key={collision.resourceKey}
            className="border-border flex flex-col gap-2 rounded-lg border p-3 sm:flex-row sm:items-center sm:justify-between"
          >
            <div className="flex flex-col gap-0.5">
              <p className="text-foreground text-sm font-medium">
                {collision.name}
                {collision.code ? (
                  <span className="text-muted-foreground font-normal"> ({collision.code})</span>
                ) : null}
              </p>
              <p className="text-muted-foreground text-xs">
                Already in this organisation
                {collision.existing.code ? ` as ${collision.existing.code}` : ''}
                {collision.existing.archived ? ' — archived' : ''}.
                {collision.existing.archived ? ' Reusing it will bring it back into use.' : ''}
              </p>
            </div>
            <div className="flex items-center gap-2">
              {answered ? null : (
                // Named, not just implied by an unselected control: three unanswered rows in a list
                // read as "nothing to do here" until Confirm refuses.
                <Badge variant="warning">Needs an answer</Badge>
              )}
              <SegmentedControl<ResourceCollisionResolution>
                label={`What to do about the resource “${collision.name}”`}
                value={answered ?? null}
                onChange={(resolution) => onChange(collision.resourceKey, resolution)}
                options={[
                  { value: 'REUSE_EXISTING', label: 'Use the existing one' },
                  { value: 'CREATE_COPY', label: 'Import a copy' },
                ]}
              />
            </div>
          </li>
        );
      })}
    </ul>
  );
}
