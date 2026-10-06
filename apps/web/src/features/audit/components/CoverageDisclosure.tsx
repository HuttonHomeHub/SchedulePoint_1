import { Disclosure } from '@/components/ui/disclosure';

/**
 * **The coverage rule: folded away for a sighted reader, always announced to a screen reader.**
 *
 * M3 of the page-consistency epic moved both audit screens' standing prose out of the top of the
 * page — it cost ~108 px in front of every reader including the ones who already know the rule,
 * and `AuditEventList`'s own empty state says the same thing compressed. It first did that with a
 * `<details>`, on the stated-but-unverified belief that `aria-describedby` resolves into a
 * collapsed one.
 *
 * **It does not, and this component exists because the claim was finally checked.** Measured in
 * Chromium via CDP `Accessibility.getFullAXTree`, with a `role="region"` pointing at a paragraph
 * inside a `<details>`:
 *
 * ```
 * COLLAPSED  description = null
 * EXPANDED   description = "The coverage rule, …"
 * ```
 *
 * A closed `<details>` has its subtree skipped in a way the accessible-description computation
 * cannot reach — unlike the `hidden` attribute and unlike an `sr-only` clip, both of which DO
 * resolve (probed in the same run). So the description was delivered only when the disclosure was
 * already open, which is exactly the state where a reader can see it anyway: the link bought
 * nothing in the state that mattered.
 *
 * **So the content is always in the DOM and the toggle changes only whether it is visible.** One
 * copy of the text, one element for `aria-describedby` to resolve, correct in both states — rather
 * than an `sr-only` duplicate beside a visible one, which would announce the rule twice to anyone
 * who opened it.
 *
 * A `<button aria-expanded>` rather than `<summary>`, because `<summary>` only exists inside
 * `<details>` and `<details>` is the thing that cannot hold this content.
 *
 * **The mechanism now lives in `components/ui/disclosure.tsx`** (staff console redesign M2), with
 * `collapsed="described"` — the mode this component's measurement is the reason for. This is a
 * caller: the label and the id are all it decides.
 */
export function CoverageDisclosure({
  contentId,
  children,
}: {
  /** The id the list's `aria-describedby` points at. Stable, supplied by the screen. */
  contentId: string;
  children: React.ReactNode;
}): React.ReactElement {
  return (
    <Disclosure
      label="What this records"
      collapsed="described"
      contentId={contentId}
      className="mt-3"
    >
      {children}
    </Disclosure>
  );
}
