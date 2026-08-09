import { createContext, useContext, useId } from 'react';

import { cn } from '@/lib/utils';

/**
 * **Why a form field is shut, rendered once and pointed at by every field it covers** (ADR-0083 D4).
 *
 * Structurally compatible with ADR-0060's `ScopeGate`, so an editor gate satisfies it unchanged —
 * which is the point: the activity editor has already fused role and pen into one object, and a
 * second `{ writable, reason }` assembled beside it is how two answers to one question start to
 * disagree (ADR-0082's identity-assertion lesson).
 */
export interface FieldGate {
  writable: boolean;
  reason: string | null;
}

interface FieldGateContextValue {
  writable: boolean;
  /** The id of the visible reason paragraph, or `undefined` when the gate is open. */
  reasonId: string | undefined;
}

const FieldGateContext = createContext<FieldGateContextValue | null>(null);

/**
 * Renders the group's reason ONCE, above the fields, and publishes its id through context. Every
 * `*Field` inside describes itself with that node instead of printing a copy — nineteen fields on
 * the activity editor's Scheduling tab would otherwise repeat one sentence nineteen times.
 *
 * The paragraph is **real, visible text — not `sr-only`** — because a sighted keyboard user needs
 * it too, and because a gated `<select>` is out of the tab sequence (ADR-0083 D1) and the visible
 * sentence is then the only channel that reaches everyone.
 *
 * A writable gate renders no paragraph and publishes no id, so the open state costs nothing: the
 * fields see `writable: true` and behave exactly as they did before this primitive existed.
 */
export function FieldGateProvider({
  gate,
  className,
  children,
}: {
  gate: FieldGate;
  className?: string;
  children: React.ReactNode;
}): React.ReactElement {
  const reasonId = useId();
  const shut = !gate.writable && gate.reason !== null;

  return (
    <FieldGateContext.Provider
      value={{ writable: gate.writable, reasonId: shut ? reasonId : undefined }}
    >
      {shut ? (
        <p
          id={reasonId}
          // `tabIndex={-1}` so a host can move focus here when the flip lands on a gated
          // `<select>`, which leaves the tab sequence and takes the reader's focus with it
          // (ADR-0083 D8 — the host announces the flip; the primitive only provides the target).
          tabIndex={-1}
          className={cn('text-muted-foreground text-sm', className)}
        >
          {gate.reason}
        </p>
      ) : null}
      {children}
    </FieldGateContext.Provider>
  );
}

/** The nearest enclosing gate, or `null` when no provider is above. */
export function useFieldGate(): FieldGateContextValue | null {
  return useContext(FieldGateContext);
}

/**
 * The gate a field actually obeys: its **own** beats the group's, and `null` opts out entirely.
 *
 * Nearest reason wins because a specific one is always more useful than a general one —
 * `ActivityCalendarField`'s RESOURCE_DEPENDENT sentence beats "Start editing to change this
 * activity". `null` is the escape for a control that stays live inside a read-only region (a
 * filter, a search box), and it has to be distinguishable from "no prop", which is why the prop
 * type is `FieldGate | null | undefined` rather than a boolean.
 *
 * A field-level gate renders its reason where the field's hint goes; a group gate is described by
 * the provider's paragraph. Hence two return shapes rather than one.
 */
export function resolveFieldGate(
  own: FieldGate | null | undefined,
  inherited: FieldGateContextValue | null,
): { shut: boolean; ownReason: string | null; groupReasonId: string | undefined } {
  if (own === null) return { shut: false, ownReason: null, groupReasonId: undefined };
  if (own !== undefined) {
    return {
      shut: !own.writable,
      ownReason: own.writable ? null : own.reason,
      groupReasonId: undefined,
    };
  }
  if (inherited === null) return { shut: false, ownReason: null, groupReasonId: undefined };
  return {
    shut: !inherited.writable,
    ownReason: null,
    groupReasonId: inherited.writable ? undefined : inherited.reasonId,
  };
}

/**
 * The lock glyph that sits beside a gated field's label.
 *
 * **This carries the state, because the fill cannot** (ADR-0083 D6, corrected). The ruling first
 * proposed moving a gated field's fill from `--field` to `--muted`; the computed contrast matrix
 * refused it, and the follow-up probe showed the failure is not `--muted`'s but structural: on
 * every light theme `--field` is `oklch(1 0 0)` and `--input` sits at 3.36:1 against it, so
 * darkening the fill by as little as 0.04 in L drops the control's outline to 2.99:1 — under WCAG
 * 1.4.11. The `auth` family has none of even that margin, because ADR-0077 M7 derived that family's
 * outline value specifically to land at 3.01–3.36:1 on exactly the current fill. So a gated fill is
 * a 1.4.11 failure on the login screens by construction, and a treatment that appears only on Dark
 * would teach a cue that is not there.
 *
 * `aria-hidden` because the state is already announced: `readonly` maps to `aria-readonly` through
 * HTML-AAM, and the reason sentence is linked by `aria-describedby`. This is the third channel
 * (WCAG 1.4.1 — never colour alone), and it is a shape rather than a colour.
 */
export function FieldGateLock(): React.ReactElement {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      className="text-muted-foreground inline-block size-3.5 shrink-0 align-[-0.125em]"
    >
      <rect width="18" height="11" x="3" y="11" rx="2" ry="2" />
      <path d="M7 11V7a5 5 0 0 1 10 0v4" />
    </svg>
  );
}
