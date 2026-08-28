import { createMeasureCache } from '../measure';

/**
 * Session-lived width memo for label text (font is fixed, so keyed by string alone). Held at
 * module scope so it persists across frames and canvas instances — a given label measures once.
 *
 * Its own module (ADR-0078 S2) because **two** layers share this one instance — the activity
 * labels (layer 3.6) and the flanking dates (layer 3.7) — and it is keyed by text alone. Splitting
 * it into a cache per layer would look tidy, cost nothing visible, and be wrong: the two would
 * then hold separate entries for the same string, and the point of the memo is that a label
 * measures once for the session. The keying also carries a live hazard the original docblock
 * records — the key is the string, not the string plus the font — so a future font change would
 * poison every entry across palettes. One module makes that one place to fix.
 */
export const labelWidths = createMeasureCache();

/**
 * **The font-load bust** (#173). `LABEL_FONT` now leads with the product's own face, which is a
 * self-hosted woff2 — so a label measured before the file arrives is measured in the FALLBACK
 * face, and the memo (keyed by text alone, deliberately) would hold that wrong width for the
 * session: the exact poisoning the docblock above has warned about since it was written. When the
 * document's fonts finish loading after this module was first used, drop everything measured so
 * far; the next frame re-measures in the real face. One-shot, module-level, and a no-op wherever
 * `document.fonts` does not exist (jsdom), where nothing ever loads and the fallback IS the font.
 */
if (typeof document !== 'undefined' && 'fonts' in document) {
  void document.fonts.ready.then(() => {
    labelWidths.clear();
  });
}
