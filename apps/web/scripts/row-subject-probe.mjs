/**
 * The clip probe for `RowSubject` (docs/specs/row-subject-truncation, M0-T1, spec SC-1/SC-2/SC-7).
 *
 * **Why this is not `scrollWidth`, and not `text-overflow`.** `measure-overview.mjs` counted a run
 * as truncated only when the text node's DIRECT parent had `text-overflow: ellipsis`. A plan name's
 * text sits inside the router `<a>` — an INLINE box, whose `scrollWidth` and `clientWidth` are both
 * 0 — and the `<a>`'s parent is the truncating span, so no clipped plan name was ever counted.
 * This probe instead asks the layout where every glyph is: `Range.getClientRects()` on each text
 * node, compared horizontally against the nearest ancestor that clips or scrolls (computed
 * `overflow-x` other than `visible`) and against the viewport. A glyph more than 0.5 px past either
 * edge is clipped. Vertical clipping (a scrolling `fill` body) is by design and is not counted.
 *
 * The function is SELF-CONTAINED because Playwright serialises it into the page: it may reference
 * only browser globals, never an import. The harness and the journey both pass it to
 * `page.evaluate(probeRowSubjects)`, so they share one definition of "clipped".
 *
 * Classification of a subject's parts, without adding more hooks to the product: the first element
 * child is the NAME (or, after M1, the name group); a later child whose text is the badge's is the
 * BADGE; the last remaining child is the CONTEXT. `sr-only` children are skipped.
 */
/* global document, getComputedStyle, NodeFilter */
export function probeRowSubjects() {
  const EDGE = 0.5;
  const vw = document.documentElement.clientWidth;

  const clipAncestor = (node, stop) => {
    for (let el = node.parentElement; el; el = el.parentElement) {
      const cs = getComputedStyle(el);
      if (cs.overflowX !== 'visible') return el;
      if (el === stop) break;
    }
    // The subject itself did not clip: keep climbing past it to the nearest scroller/clipper.
    for (let el = stop?.parentElement ?? null; el; el = el.parentElement) {
      if (getComputedStyle(el).overflowX !== 'visible') return el;
    }
    return null;
  };

  const measure = (part, subject) => {
    const empty = {
      chars: 0,
      shownChars: 0,
      needsPx: 0,
      shownPx: 0,
      clippedRects: 0,
      clipped: false,
      ellipsis: false,
      ellipsisTruncating: false,
      lineTops: [],
    };
    if (!part) return empty;
    const out = { ...empty, lineTops: [] };
    const walker = document.createTreeWalker(part, NodeFilter.SHOW_TEXT);
    for (let n = walker.nextNode(); n; n = walker.nextNode()) {
      const text = n.textContent ?? '';
      if (!text.trim()) continue;
      const host = n.parentElement;
      const clip = host ? clipAncestor(n, subject) : null;
      const cr = clip ? clip.getBoundingClientRect() : null;
      const left = Math.max(0, cr ? cr.left : 0);
      const right = Math.min(vw, cr ? cr.right : vw);
      const range = document.createRange();
      range.selectNodeContents(n);
      // Chrome reports BOTH the box a truncated run was painted in and its full natural extent as
      // separate rects (measured 2026-10-09: 224 px and 201 px from one left edge for one name), so
      // widths are the UNION of intervals per line, never a sum.
      const byLine = new Map();
      for (const r of range.getClientRects()) {
        if (r.width === 0 && r.height === 0) continue;
        const key = Math.round(r.top / 4);
        const list = byLine.get(key) ?? [];
        list.push([r.left, r.right]);
        byLine.set(key, list);
        if (r.right > right + EDGE || r.left < left - EDGE) out.clippedRects += 1;
        out.lineTops.push((r.top + r.bottom) / 2);
      }
      for (const spans of byLine.values()) {
        spans.sort((a, b) => a[0] - b[0]);
        let [from, to] = spans[0];
        const flush = () => {
          out.needsPx += to - from;
          out.shownPx += Math.max(0, Math.min(to, right) - Math.max(from, left));
        };
        for (const [a, b] of spans.slice(1)) {
          if (a <= to) to = Math.max(to, b);
          else {
            flush();
            [from, to] = [a, b];
          }
        }
        flush();
      }
      // Characters: a glyph is shown when its own rect lies inside the clip edges.
      for (let i = 0; i < text.length; i += 1) {
        if (!text[i].trim()) continue;
        out.chars += 1;
        const cr1 = document.createRange();
        cr1.setStart(n, i);
        cr1.setEnd(n, i + 1);
        const rect = cr1.getClientRects()[0];
        if (rect && rect.right <= right + EDGE && rect.left >= left - EDGE) out.shownChars += 1;
      }
      // Any ellipsis in effect between the text and the subject.
      for (let el = host; el; el = el.parentElement) {
        const cs = getComputedStyle(el);
        if (cs.textOverflow === 'ellipsis') {
          out.ellipsis = true;
          if (el.scrollWidth > el.clientWidth) out.ellipsisTruncating = true;
        }
        if (el === subject) break;
      }
    }
    out.clipped = out.clippedRects > 0 || out.shownChars < out.chars || out.ellipsisTruncating;
    out.needsPx = Math.round(out.needsPx);
    out.shownPx = Math.round(out.shownPx);
    return out;
  };

  const subjects = [...document.querySelectorAll('[data-row-subject]')];
  return {
    found: subjects.length,
    docOverflowX: document.documentElement.scrollWidth - document.documentElement.clientWidth,
    subjects: subjects.map((subject) => {
      const kids = [...subject.children].filter((c) => !c.classList.contains('sr-only'));
      const name = kids[0] ?? null;
      const rest = kids.slice(1);
      const badge = rest.find((c) => (c.textContent ?? '').trim() === 'Draft') ?? null;
      const context = rest.filter((c) => c !== badge).pop() ?? null;
      const section = subject.closest('section[aria-labelledby], section[aria-label]');
      const labelled = section?.getAttribute('aria-labelledby');
      const region =
        section?.getAttribute('aria-label') ??
        (labelled ? (document.getElementById(labelled)?.textContent ?? '') : '');
      const row = subject.closest('.border-b');
      const nameM = measure(name, subject);
      const ctxM = measure(context, subject);
      // Lines are clusters of vertical centres: the name (16 px) and the context (14 px) sit at
      // different TOPS on one line, so a bucket on tops reports one line as two.
      const mids = [...nameM.lineTops, ...ctxM.lineTops].sort((a, b) => a - b);
      let lineCount = mids.length > 0 ? 1 : 0;
      for (let i = 1; i < mids.length; i += 1) if (mids[i] - mids[i - 1] > 8) lineCount += 1;
      return {
        region: region.trim(),
        text: (subject.textContent ?? '').trim().slice(0, 90),
        hasBadge: Boolean(badge),
        hasContext: Boolean(context),
        name: nameM,
        context: ctxM,
        lines: lineCount,
        rowHeight: row ? Math.round(row.getBoundingClientRect().height) : null,
      };
    }),
  };
}

/** One-line summary a harness can print per cell. */
export function summariseProbe(result) {
  const median = (xs) => {
    if (xs.length === 0) return 0;
    const s = [...xs].sort((a, b) => a - b);
    return s[Math.floor(s.length / 2)];
  };
  const s = result.subjects;
  return {
    rows: s.length,
    namesClipped: s.filter((x) => x.name.clipped).length,
    contextsClipped: s.filter((x) => x.context.clipped).length,
    medianNameShownPx: median(s.map((x) => x.name.shownPx)),
    medianNameShownChars: median(s.map((x) => x.name.shownChars)),
    medianContextShownPx: median(s.filter((x) => x.hasContext).map((x) => x.context.shownPx)),
    medianContextShownChars: median(s.filter((x) => x.hasContext).map((x) => x.context.shownChars)),
    medianRowHeight: median(s.map((x) => x.rowHeight ?? 0)),
    docOverflowX: result.docOverflowX,
  };
}
