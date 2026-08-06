/**
 * The one bordered, tinted treatment a failure gets, in one place (ADR-0077 M6-T2).
 *
 * `FormErrorSummary` (`form.tsx`) and `ServerError` (`server-error.tsx`) had this exact string
 * hand-written twice — the same defect `textLinkVariants` was introduced in this very epic to
 * remove, one file along, and the component review caught it. Two copies of a colour treatment
 * drift the moment one is touched for a contrast fix, and nothing would fail: each looks right on
 * its own, and only a reader who saw a client-side and a server-side error side by side would ever
 * notice one was a version behind. That is the ADR-0062 shape.
 *
 * A plain `const` rather than a CVA factory, deliberately: there are no variants. Adding a variant
 * axis is what CVA is for; declaring one with a single value is ceremony that hides the fact.
 * `docs/COMPONENT_LIBRARY.md`'s rule is "declare the variant matrix once", and a matrix of one is
 * a constant.
 *
 * The colour is `--destructive-text`, not `--destructive`: the latter is a *surface* fill and the
 * former is the text-on-background pair the ADR-0055 contrast matrix gates at 4.5:1.
 */
export const alertBoxClassName =
  'border-destructive-text bg-destructive-text/5 text-destructive-text rounded-md border p-3 text-sm';
