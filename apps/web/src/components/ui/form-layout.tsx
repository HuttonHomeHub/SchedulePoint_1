import { createContext, useContext, useId } from 'react';

import { cn } from '@/lib/utils';

/**
 * **Form layout primitives** (ADR-0061) — the grouping vocabulary every dialog body is built from.
 *
 * The problem these exist to end: eighteen dialogs each rendered
 * `<div className="flex flex-col gap-4">` around a list of fields, so a nine-field scheduling form
 * and a one-field baseline form had **identical** visual structure. Nothing said which fields
 * belonged together, which were consequential, or which were defaults nobody needed to read. That
 * is not a styling problem — Tailwind classes cannot express "these two controls are one decision" —
 * so the fix has to be a component that carries the grouping, not a class someone remembers to add.
 *
 * Three pieces, deliberately small:
 *
 * - {@link FormSection} — a named group of related fields, in the accessibility tree as well as in
 *   the pixels.
 * - {@link FieldGrid} — two columns where two controls are one thought (a constraint and its date),
 *   collapsing to one column when there is no room.
 * - {@link ContextStrip} — the facts the edit is *about*, kept visible while it is made.
 *
 * They compose; none of them knows what dialog it is in; none takes a colour, a width or a variant.
 * `docs/DESIGN_SYSTEM.md` §"Form layout" is the authoring rule.
 */

/* ------------------------------------------------------------------------- */
/* FormSection                                                                */
/* ------------------------------------------------------------------------- */

/**
 * Nested sections would nest one group inside another and emit an `h3` inside an `h3`'s group —
 * the grouping this primitive exists to express, made ambiguous. There is no legitimate use for it
 * in a dialog body, so it fails loud in development and renders anyway in production (the
 * {@link Surface} precedent: a mis-nested wrapper should never blank a planner's screen).
 */
const InFormSectionContext = createContext(false);

export interface FormSectionProps extends Omit<React.HTMLAttributes<HTMLDivElement>, 'title'> {
  /**
   * What this group of fields is, in the planner's words — "Constraints", "Availability",
   * "Cost & notes". Always required: an unnamed group is the flat list this primitive replaces.
   */
  title: string;
  /**
   * One sentence on what the group *does*, when the title cannot carry it alone. Linked to the
   * group with `aria-describedby`, so it is announced with the group rather than stranded as
   * decoration.
   */
  description?: string;
  /**
   * The heading level for {@link title}. **Defaults to 3, which is right inside a dialog** — the
   * `Dialog` title is an `h2`, so a section under it is an `h3` and the sequence is unbroken.
   *
   * On a **page**, whose own title is the `h1`, that same default skips a level (axe `heading-order`,
   * caught by the ADR-0074 M5-T1 gate pass on `/account`). Pass `2` there. It is a prop rather than
   * a guess from context because a component cannot see its ancestors' heading levels, and inferring
   * one from `useContext` would be a rule that silently breaks the first time a section is nested
   * somewhere new.
   */
  headingLevel?: 2 | 3;
  /**
   * A status for the group as a whole — a count, a badge, "Not set". Rendered right-aligned on the
   * title row. This is what lets a reader skip a section honestly: a group that says "Not set" has
   * told them what is inside it.
   */
  aside?: React.ReactNode;
}

/**
 * A named group of related fields.
 *
 * **`role="group"` + a real `<h3>`, not `<fieldset>`/`<legend>`.** A `<legend>` only captions its
 * fieldset when it is the fieldset's first child, which rules out putting a status beside it on the
 * same row; and a fieldset's `min-width: min-content` default makes it refuse to shrink below its
 * widest child, which overflows a narrow dialog silently. The ARIA pair is exactly equivalent for
 * grouping, has neither constraint, and adds heading navigation for free — a screen-reader user can
 * jump between sections instead of arrowing through every control.
 *
 * Sibling sections separate themselves, so a consumer never hand-places a `border-t`. That was the
 * previous idiom and it drifted immediately: the activity editor's Scheduling tab carried four
 * hand-built `fieldset`s each with an `sr-only` legend **and** a duplicate `aria-hidden` paragraph,
 * because the visible heading and the accessible name had been solved twice, separately.
 *
 * The rule that buys that: **sections are consecutive siblings**. The first one drops its rule via
 * `:first-child`, so anything that must precede them — an error summary, a banner — belongs outside
 * the sections' own wrapper, not interleaved with them.
 */
export function FormSection({
  title,
  description,
  aside,
  headingLevel = 3,
  className,
  children,
  ...rest
}: FormSectionProps): React.ReactElement {
  const nested = useContext(InFormSectionContext);
  if (nested && import.meta.env.DEV) {
    throw new Error(
      `<FormSection title="${title}"> is nested inside another FormSection. Sections are siblings — ` +
        `a group inside a group makes the heading level and the grouping ambiguous. Use a sibling ` +
        `section, or plain markup for the inner grouping.`,
    );
  }
  const base = useId();
  const Heading = headingLevel === 2 ? 'h2' : 'h3';
  const titleId = `${base}-title`;
  const descriptionId = `${base}-description`;

  return (
    <InFormSectionContext value={true}>
      <div
        role="group"
        aria-labelledby={titleId}
        {...(description ? { 'aria-describedby': descriptionId } : {})}
        className={cn(
          'border-border flex min-w-0 flex-col gap-3 border-t pt-5 first:border-t-0 first:pt-0',
          className,
        )}
        {...rest}
      >
        <div className="flex items-baseline justify-between gap-3">
          <Heading
            id={titleId}
            className="text-muted-foreground text-xs font-semibold tracking-wider uppercase"
          >
            {title}
          </Heading>
          {aside ? <span className="text-muted-foreground text-right text-xs">{aside}</span> : null}
        </div>
        {description ? (
          <p id={descriptionId} className="text-muted-foreground -mt-1 text-sm">
            {description}
          </p>
        ) : null}
        <div className="flex min-w-0 flex-col gap-4">{children}</div>
      </div>
    </InFormSectionContext>
  );
}

/* ------------------------------------------------------------------------- */
/* FieldGrid                                                                  */
/* ------------------------------------------------------------------------- */

export interface FieldGridProps extends React.HTMLAttributes<HTMLDivElement> {
  /**
   * `'even'` (default) gives two equal columns. `'lead'` weights the first ~4:3, for the recurring
   * shape where a wide chooser governs a narrow value — a constraint type and its date, a resource
   * and its units.
   */
  columns?: 'even' | 'lead';
}

/**
 * Two columns where there is room for them, one where there isn't.
 *
 * **A container query, not a breakpoint.** A dialog's width is set by its size preset, not by the
 * viewport: the activity editor is 896px wide on a desktop *and* inside a 900px pane, while a
 * `md` dialog is 448px on that same desktop. A `sm:` breakpoint would give both the same answer and
 * be wrong for one of them. `@container` asks the question that actually matters — "is *this*
 * region wide enough for two columns" — which is why every consumer wraps its body in
 * {@link FieldGridContainer}.
 */
export function FieldGrid({
  columns = 'even',
  className,
  children,
  ...rest
}: FieldGridProps): React.ReactElement {
  return (
    <div
      className={cn(
        'grid min-w-0 grid-cols-1 gap-4',
        // @sm = 24rem (384px). A `md` dialog gives its body 400px, so paired fields split there;
        // the same dialog on a phone is ~295px and stays in one column. Chosen against those two
        // real widths, not picked off the scale.
        columns === 'lead' ? '@sm:grid-cols-[1.35fr_1fr]' : '@sm:grid-cols-2',
        className,
      )}
      {...rest}
    >
      {children}
    </div>
  );
}

/**
 * Establishes the containment context {@link FieldGrid} measures against. Wrap a dialog body (or a
 * pane) in this once; every grid inside then responds to that region's width rather than the
 * window's.
 */
export function FieldGridContainer({
  className,
  children,
  ...rest
}: React.HTMLAttributes<HTMLDivElement>): React.ReactElement {
  return (
    <div className={cn('@container min-w-0', className)} {...rest}>
      {children}
    </div>
  );
}

/**
 * A child that spans the whole grid — a textarea, an error summary, a save bar. Exists so callers
 * never hand-write `col-span-2` and get it wrong when the column count changes.
 */
export function FieldGridFull({
  className,
  children,
  ...rest
}: React.HTMLAttributes<HTMLDivElement>): React.ReactElement {
  return (
    <div className={cn('col-span-full min-w-0', className)} {...rest}>
      {children}
    </div>
  );
}

/* ------------------------------------------------------------------------- */
/* ContextStrip                                                               */
/* ------------------------------------------------------------------------- */

export interface ContextFact {
  /** What the value is. Kept short — this is a column heading, not a sentence. */
  label: string;
  /** The value. A node, so a fact can carry a badge (`Critical`) as well as a date. */
  value: React.ReactNode;
}

export interface ContextStripProps extends React.HTMLAttributes<HTMLDListElement> {
  /** Accessible name for the group — "Computed schedule", "What this baseline will capture". */
  label: string;
  facts: ReadonlyArray<ContextFact>;
}

/**
 * The facts an edit is *about*, kept on screen while it is made.
 *
 * A planner changing an activity's constraint wants to know its current dates and float; before
 * this the editor showed neither, so the only way to answer "did that do what I wanted?" was to
 * close the dialog and read the table. Rendered as a `<dl>` because that is what it is — labelled
 * values, not a table and not a list of controls — which is also what makes a screen reader
 * announce "Total float, 0 days" as a pair.
 *
 * **Read-only by contract**: no interactive children, ever. The moment a fact becomes editable it
 * is a field and belongs in a {@link FormSection}.
 */
export function ContextStrip({
  label,
  facts,
  className,
  ...rest
}: ContextStripProps): React.ReactElement {
  return (
    <dl
      aria-label={label}
      className={cn(
        'bg-muted border-border flex flex-wrap gap-x-6 gap-y-3 rounded-md border px-4 py-3',
        className,
      )}
      {...rest}
    >
      {facts.map((fact) => (
        <div key={fact.label} className="flex flex-col gap-0.5">
          <dt className="text-muted-foreground text-[0.625rem] font-semibold tracking-wider uppercase">
            {fact.label}
          </dt>
          <dd className="text-sm font-semibold tabular-nums">{fact.value}</dd>
        </div>
      ))}
    </dl>
  );
}
