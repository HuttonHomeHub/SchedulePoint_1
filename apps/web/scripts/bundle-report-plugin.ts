import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { gzipSync } from 'node:zlib';

import type { Plugin } from 'vite';

/**
 * **What the browser downloads before it can render anything, measured rather than asserted.**
 *
 * `docs/specs/delivery-gates/` M3. `docs/FRONTEND_QUALITY.md` carried a ~200 kB budget that
 * predates any build being looked at, and nothing in CI ever compared it to a real artefact.
 *
 * ## The quantity, and why it is not the entry chunk
 *
 * The entry **graph** is the entry chunk plus the transitive closure of its **static** imports —
 * everything the browser must have parsed before the app renders. `chunk.dynamicImports` is
 * deliberately excluded and walked separately: a `jspdf` behind an `await import()` costs the first
 * paint nothing, and counting it would make the number describe a download nobody performs.
 *
 * Rollup gives both lists explicitly, which is the reason this is a `generateBundle` hook rather
 * than a walk over `dist/`. Filenames on disk cannot say which import was static.
 *
 * ## gzip, not raw
 *
 * It is what crosses the wire — nginx serves the deployed bundle compressed. `node:zlib` rather
 * than a package: it is in the standard library and this repository treats every dependency as a
 * liability (CLAUDE.md §2). Brotli would be closer still for modern browsers; gzip is the
 * conservative floor and the one every proxy in the path supports.
 *
 * **The report is written OUTSIDE `dist/`**, so it can never be served, and so that adding it
 * leaves the deployed artefact byte-identical — asserted as R5 in the milestone rather than assumed.
 */
export interface BundleChunkReport {
  file: string;
  raw: number;
  gzip: number;
  /** True when this chunk is reachable from the entry through STATIC imports only. */
  inEntryGraph: boolean;
  /**
   * The `node_modules` package names whose code ended up **inside** this chunk.
   *
   * **Chunk NAMES cannot answer "is this library in the first paint?", and finding that out is why
   * this field exists.** While `jspdf` is behind a dynamic import Rollup gives it a chunk called
   * `jspdf.es.min-*.js`, and a scan for that name works. Make the import static — the actual defect
   * `docs/TECH_DEBT.md` #48(b) is about — and Rollup **inlines it into the entry chunk**: the
   * separate chunk disappears, the name is nowhere, and a name-based assertion goes quiet at
   * exactly the moment it was written to fire. Measured, by doing it.
   *
   * Module ids survive that, because they are what the chunk is made of rather than what it is
   * called. Only the package name is kept: the full id list runs to thousands of paths and none of
   * them is a thing anybody would assert on.
   */
  packages: string[];
}

export interface BundleReport {
  measuredAt: string;
  entry: string;
  /** The entry chunk plus its static-import closure — the first-paint cost. */
  entryGraph: { chunks: number; raw: number; gzip: number };
  /** Every emitted JS chunk, largest gzip first. */
  chunks: BundleChunkReport[];
  css: { raw: number; gzip: number };
}

/**
 * The transitive closure of a chunk's STATIC imports.
 *
 * Iterative rather than recursive, and `seen`-guarded: a chunk graph may contain cycles, and a
 * recursive walk over one does not return.
 */
export function staticClosure(
  entry: string,
  importsOf: (file: string) => readonly string[],
): Set<string> {
  const seen = new Set<string>([entry]);
  const queue = [entry];
  while (queue.length > 0) {
    const file = queue.pop()!;
    for (const next of importsOf(file)) {
      if (seen.has(next)) continue;
      seen.add(next);
      queue.push(next);
    }
  }
  return seen;
}

/**
 * The `node_modules` package names present in a list of module ids, deduplicated and sorted.
 *
 * Scoped packages keep both segments (`@scope/name`); a path with no `node_modules` segment is this
 * repository's own source and contributes nothing. The LAST `node_modules` wins, so a nested
 * dependency is attributed to itself rather than to whatever hoisted it.
 */
export function packagesIn(moduleIds: readonly string[]): string[] {
  const found = new Set<string>();
  for (const id of moduleIds) {
    const parts = id.split('node_modules/');
    if (parts.length < 2) continue;
    const tail = parts[parts.length - 1]!.split('/');
    const name = tail[0]?.startsWith('@') ? `${tail[0]}/${tail[1] ?? ''}` : tail[0];
    if (name) found.add(name);
  }
  return [...found].sort();
}

export function bundleReportPlugin(outFile: string): Plugin {
  return {
    name: 'schedulepoint:bundle-report',
    apply: 'build',
    generateBundle(_options, bundle) {
      const chunks = Object.values(bundle).filter(
        (c): c is Extract<typeof c, { type: 'chunk' }> => c.type === 'chunk',
      );
      const entry = chunks.find((c) => c.isEntry);
      if (!entry) return;

      const byFile = new Map(chunks.map((c) => [c.fileName, c]));
      const closure = staticClosure(entry.fileName, (file) => byFile.get(file)?.imports ?? []);

      const size = (code: string) => ({
        raw: Buffer.byteLength(code),
        gzip: gzipSync(code).length,
      });

      const reported: BundleChunkReport[] = chunks
        .map((c) => ({
          file: c.fileName,
          ...size(c.code),
          inEntryGraph: closure.has(c.fileName),
          packages: packagesIn(c.moduleIds ?? []),
        }))
        .sort((a, b) => b.gzip - a.gzip);

      const graph = reported.filter((c) => c.inEntryGraph);
      const css = Object.values(bundle)
        .filter((a): a is Extract<typeof a, { type: 'asset' }> => a.type === 'asset')
        .filter((a) => a.fileName.endsWith('.css'))
        .map((a) =>
          size(typeof a.source === 'string' ? a.source : Buffer.from(a.source).toString()),
        )
        .reduce((acc, s) => ({ raw: acc.raw + s.raw, gzip: acc.gzip + s.gzip }), {
          raw: 0,
          gzip: 0,
        });

      const report: BundleReport = {
        measuredAt: new Date().toISOString(),
        entry: entry.fileName,
        entryGraph: {
          chunks: graph.length,
          raw: graph.reduce((n, c) => n + c.raw, 0),
          gzip: graph.reduce((n, c) => n + c.gzip, 0),
        },
        chunks: reported,
        css,
      };

      const path = resolve(outFile);
      mkdirSync(dirname(path), { recursive: true });
      writeFileSync(path, `${JSON.stringify(report, null, 2)}\n`);
    },
  };
}
