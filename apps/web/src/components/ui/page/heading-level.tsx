import { createContext, useContext } from 'react';

/**
 * The ranks a section heading can take on a page. `h1` is the page's own title (`PageHeader`) and
 * is never derived; `h4` is where the staff console stops, so the type has no `h5` to reach for.
 */
export type HeadingLevel = 2 | 3 | 4;

/**
 * **The rank the NEXT section heading takes, derived from where it sits and never passed per call**
 * (staff console redesign, ADR-0145 D1 extended).
 *
 * Seventeen consumers render a `SectionCard` as a page's second-level heading, and they must go on
 * doing so with byte-identical markup. So the default is `2` — the value a card outside any
 * provider reads — and only a `SectionGroup` (which supplies `3` to what it contains) or a
 * `SectionCard` (which supplies its own rank plus one to its body, for a `SubSection`) changes it.
 *
 * **A prop would be the same decision made at every call site**, and a heading rank that is wrong
 * is invisible on screen: the cost of a skipped level falls on a screen-reader user navigating by
 * heading (WCAG 1.3.1, 2.4.6), which is exactly the reader nothing here tests with a pointer.
 */
export const HeadingLevelContext = createContext<HeadingLevel>(2);

/** The rank a heading rendered here takes. */
export function useHeadingLevel(): HeadingLevel {
  return useContext(HeadingLevelContext);
}

/** One rank deeper, stopping at the deepest the type allows rather than inventing an `h5`. */
export function deeper(level: HeadingLevel): HeadingLevel {
  return level === 2 ? 3 : 4;
}
