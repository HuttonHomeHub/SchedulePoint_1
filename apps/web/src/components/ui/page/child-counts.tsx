/**
 * The child counts a detail screen states beside its title — "4 projects · 11 plans".
 *
 * **Absent, never zero-by-default, and never fabricated.** Each count is `number | undefined`: the
 * API omits one it could not take rather than reporting `0`, because a zero is a claim that there
 * are none and nothing on this screen can tell a fabricated zero from a real one (ADR-0126,
 * ADR-0098's "omitted, never zeroed"). A count that is genuinely `0` IS rendered — "No projects"
 * is a fact the reader wants. An `undefined` one is dropped from the list, and if every count is
 * undefined the whole element renders nothing rather than an empty separator.
 *
 * **The wording of a two-level count is load-bearing.** A client owns no plans — a plan hangs off a
 * project — so "11 plans" under a client's name reads as something the client holds directly. The
 * caller passes the whole phrase for that reason, rather than a number and a noun this component
 * pluralises: the distinction lives in the sentence, not in the suffix.
 */
export interface ChildCount {
  /** The number, or `undefined` when the API omitted it. Zero is a value, not an absence. */
  value: number | undefined;
  /** The singular phrase, e.g. `project` or `plan across its projects`. */
  one: string;
  /** The plural phrase, e.g. `projects` or `plans across its projects`. */
  many: string;
}

export interface ChildCountsProps {
  counts: ChildCount[];
}

export function ChildCounts({ counts }: ChildCountsProps): React.ReactElement | null {
  const present = counts.filter((count) => count.value !== undefined);
  if (present.length === 0) return null;

  return (
    <span className="text-muted-foreground">
      {present
        .map((count) => `${String(count.value)} ${count.value === 1 ? count.one : count.many}`)
        .join(' · ')}
    </span>
  );
}
