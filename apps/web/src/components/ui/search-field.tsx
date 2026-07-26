import { Search, X } from 'lucide-react';
import { useId } from 'react';

import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { cn } from '@/lib/utils';

/**
 * The house **Search** control (`docs/DESIGN_SYSTEM.md` → Components → Search): a labelled input
 * with a leading search icon and an explicit clear button, over the shared {@link Input}.
 *
 * It exists so the two library screens (and anything else that grows a list search) cannot each
 * re-invent the affordance — the epic that introduced them shipped bare `<Input type="search">`
 * fields with no icon and no reliable clear, because `type="search"`'s native ✕ is Chromium-only
 * and never keyboard-reachable. The button here is a real `<button>` with an accessible name, so
 * clearing works with a keyboard, a screen reader and every browser (WCAG 2.1.1 / 4.1.2).
 *
 * Presentational and fully controlled: the consumer owns the term, the debounce and the fetch. It
 * deliberately does NOT own URL state either — see {@link useUrlFilterState}, which the route
 * calls; this component just renders whatever term it is handed.
 */
export function SearchField({
  id,
  label,
  value,
  onChange,
  placeholder,
  describedBy,
  clearLabel,
  className,
}: {
  /** Input id — supply one when the consumer already owns an id; otherwise generated. */
  id?: string;
  /** Visible label. Never a placeholder-only field (WCAG 3.3.2). */
  label: string;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  /** Ids of hint/status text describing the field. */
  describedBy?: string | undefined;
  /** Accessible name for the clear button, e.g. "Clear calendar search". */
  clearLabel?: string;
  className?: string;
}): React.ReactElement {
  const generatedId = useId();
  const inputId = id ?? generatedId;
  const hasValue = value !== '';

  return (
    <div className={cn('flex flex-col gap-1.5', className)}>
      <Label htmlFor={inputId}>{label}</Label>
      <div className="relative">
        <Search
          aria-hidden="true"
          className="text-muted-foreground pointer-events-none absolute inset-y-0 left-2.5 my-auto size-4"
        />
        <Input
          id={inputId}
          type="search"
          autoComplete="off"
          placeholder={placeholder}
          value={value}
          onChange={(event) => onChange(event.target.value)}
          {...(describedBy ? { 'aria-describedby': describedBy } : {})}
          // Suppress the browser's own (mouse-only, Chromium-only) ✕ so there is exactly one
          // clear affordance, and it is the accessible one below.
          className={cn('pl-8', hasValue && 'pr-9', '[&::-webkit-search-cancel-button]:hidden')}
        />
        {hasValue ? (
          <button
            type="button"
            onClick={() => onChange('')}
            aria-label={clearLabel ?? `Clear ${label.toLowerCase()}`}
            className="text-muted-foreground hover:text-foreground focus-visible:ring-ring focus-visible:ring-offset-background absolute inset-y-0 right-0 flex w-9 items-center justify-center rounded-md focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:outline-none"
          >
            <X aria-hidden="true" className="size-4" />
          </button>
        ) : null}
      </div>
    </div>
  );
}
