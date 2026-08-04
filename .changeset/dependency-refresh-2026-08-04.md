---
'@repo/web': patch
---

Dependency refresh — accepts the open Dependabot proposals after verifying them together rather
than trusting seven separate CI greens.

Runtime: **jspdf 3.0.4 → 4.2.1** (major), lucide-react 1.28.0, react-hook-form 7.84.0,
@tanstack/react-query 5.101.4, @tanstack/react-virtual 3.14.9. Build/dev: vite 8.2.0,
tailwindcss + @tailwindcss/vite 4.3.3, @vitejs/plugin-react 6.0.5, prettier 3.9.6, turbo 2.10.8,
lint-staged 17.3.0, and the @types/@nestjs/@swc tooling.

**The jsPDF major was verified against the real library, not the mock.** `pdf.test.ts` mocks
`import('jspdf')` by design — its own docblock says "no real jsPDF runs" — so a green unit suite
proves the call _shape_ is unchanged and nothing about whether v4 accepts those calls. The four
call sites (`new jsPDF({orientation, unit, format})`, `internal.pageSize.getWidth/getHeight`,
`addImage(dataUrl, 'PNG', x, y, w, h)`, `save(filename)`) are type-identical in v4, v4 carries the
same dependency set as v3, and a smoke test through the real v4 produced a valid landscape-A4 PDF
(841.9 × 595.3 pt, `%PDF-` header). The lazy import still code-splits into its own chunk.
