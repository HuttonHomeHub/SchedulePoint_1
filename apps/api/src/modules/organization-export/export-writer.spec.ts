import { createHash, randomBytes } from 'node:crypto';
import { Readable } from 'node:stream';

import { describe, expect, it } from 'vitest';
import yauzl from 'yauzl';

import { csvPath, EXPORT_FILES, jsonPath, type ExportFile } from './export-columns';
import { createExportWriter, type ExportPageSource } from './export-writer';

const CLIENTS = EXPORT_FILES.find((f) => f.file === 'clients')!;
const PLANS = EXPORT_FILES.find((f) => f.file === 'plans')!;

const MANIFEST_INPUT = {
  generatedAt: new Date('2026-10-14T09:30:00.000Z'),
  apiVersion: '0.0.0-test',
  organization: { id: 'org-1', slug: 'acme', name: 'Acme' },
  exportedBy: { userId: 'u1', name: 'Ada' },
} as const;

/** A row with every column of `file` set to a plausible value. */
function row(file: ExportFile, id: string, overrides: Record<string, unknown> = {}) {
  const base: Record<string, unknown> = {};
  for (const column of file.columns) {
    const key = column.source ?? column.field;
    base[key] =
      column.kind === 'instant'
        ? new Date('2026-10-14T09:30:00.000Z')
        : column.kind === 'text'
          ? `${key}-${id}`
          : null;
  }
  base.id = id;
  return { ...base, ...overrides };
}

async function collect(stream: Readable): Promise<Buffer> {
  const chunks: Buffer[] = [];
  for await (const chunk of stream) chunks.push(chunk as Buffer);
  return Buffer.concat(chunks);
}

function unzip(buffer: Buffer): Promise<Map<string, Buffer>> {
  return new Promise((resolve, reject) => {
    yauzl.fromBuffer(buffer, { lazyEntries: true }, (error, zip) => {
      if (error) return reject(error);
      const files = new Map<string, Buffer>();
      zip.on('error', reject);
      zip.on('end', () => resolve(files));
      zip.on('entry', (entry: yauzl.Entry) =>
        zip.openReadStream(entry, (openError, stream) => {
          if (openError) return reject(openError);
          const chunks: Buffer[] = [];
          stream.on('data', (chunk: Buffer) => chunks.push(chunk));
          stream.on('end', () => {
            files.set(entry.fileName, Buffer.concat(chunks));
            zip.readEntry();
          });
        }),
      );
      zip.readEntry();
    });
  });
}

function source(pagesByFile: Record<string, Record<string, unknown>[][]>): ExportPageSource {
  return { pages: (file) => Readable.from(pagesByFile[file.file] ?? []) };
}

describe('createExportWriter', () => {
  it('writes the README first, each file as JSON then CSV, and the manifest last', async () => {
    const writer = createExportWriter({
      source: source({
        clients: [[row(CLIENTS, 'a'), row(CLIENTS, 'b')], [row(CLIENTS, 'c')]],
      }),
      signal: new AbortController().signal,
      manifest: MANIFEST_INPUT,
      files: [CLIENTS, PLANS],
    });

    const zip = await unzip(await collect(writer.output));

    expect([...zip.keys()]).toEqual([
      'README.txt',
      jsonPath(CLIENTS),
      csvPath(CLIENTS),
      jsonPath(PLANS),
      csvPath(PLANS),
      'manifest.json',
    ]);
  });

  it('counts and checksums exactly what it wrote, across more than one page', async () => {
    const writer = createExportWriter({
      source: source({ clients: [[row(CLIENTS, 'a'), row(CLIENTS, 'b')], [row(CLIENTS, 'c')]] }),
      signal: new AbortController().signal,
      manifest: MANIFEST_INPUT,
      files: [CLIENTS, PLANS],
    });

    const zip = await unzip(await collect(writer.output));
    const manifest = JSON.parse(zip.get('manifest.json')!.toString('utf8')) as {
      files: { path: string; rows: number; bytes: number; sha256: string }[];
    };

    expect(JSON.parse(zip.get(jsonPath(CLIENTS))!.toString('utf8'))).toHaveLength(3);
    for (const entry of manifest.files) {
      const bytes = zip.get(entry.path)!;
      expect(entry.bytes, entry.path).toBe(bytes.length);
      expect(entry.sha256, entry.path).toBe(createHash('sha256').update(bytes).digest('hex'));
    }
    expect(manifest.files.find((f) => f.path === jsonPath(CLIENTS))!.rows).toBe(3);
    expect(manifest.files.find((f) => f.path === csvPath(CLIENTS))!.rows).toBe(3);
    expect(writer.summary()).toMatchObject({ files: 4, rows: 3 });
  });

  it('writes a file with no rows as an empty array and a header-only CSV', async () => {
    const writer = createExportWriter({
      source: source({}),
      signal: new AbortController().signal,
      manifest: MANIFEST_INPUT,
      files: [PLANS],
    });

    const zip = await unzip(await collect(writer.output));

    expect(JSON.parse(zip.get(jsonPath(PLANS))!.toString('utf8'))).toEqual([]);
    const csv = zip.get(csvPath(PLANS))!.toString('utf8');
    expect(csv.split('\r\n').filter((line) => line !== '')).toHaveLength(1);
  });

  it('stops reading while nobody takes the bytes (back-pressure reaches the source)', async () => {
    let pulled = 0;
    const slow: ExportPageSource = {
      async *pages() {
        await Promise.resolve();
        for (let i = 0; i < 200; i += 1) {
          pulled += 1;
          // Incompressible, so the ZIP's output really does grow with every page.
          yield [row(CLIENTS, String(i), { description: randomBytes(25_000).toString('hex') })];
        }
      },
    };
    const writer = createExportWriter({
      source: slow,
      signal: new AbortController().signal,
      manifest: MANIFEST_INPUT,
      files: [CLIENTS],
    });

    // Nothing consumes the output. Each page is ~50 kB; a source that ignored back-pressure would
    // have been drained (200 pages, 10 MB) by now.
    await new Promise((resolve) => setTimeout(resolve, 300));
    expect(pulled).toBeLessThan(40);

    writer.output.resume();
    await new Promise<void>((resolve) => writer.output.once('end', resolve));
    // Both passes (the JSON entry and the CSV entry) read every page.
    expect(pulled).toBe(400);
  });

  it('fails the whole archive, with the cause, when a source breaks half way', async () => {
    const breaking: ExportPageSource = {
      async *pages(file) {
        await Promise.resolve();
        if (file.file === 'plans') throw new Error('the read failed');
        yield [row(CLIENTS, 'a')];
      },
    };
    const writer = createExportWriter({
      source: breaking,
      signal: new AbortController().signal,
      manifest: MANIFEST_INPUT,
      files: [CLIENTS, PLANS],
    });

    await expect(collect(writer.output)).rejects.toThrow('the read failed');
    await writer.stop();
  });

  it('stop() waits for an in-flight page read before returning', async () => {
    let release!: () => void;
    const gate = new Promise<void>((resolve) => (release = resolve));
    let finished = false;
    const stuck: ExportPageSource = {
      async *pages() {
        yield [row(CLIENTS, 'a')];
        await gate;
        finished = true;
        yield [row(CLIENTS, 'b')];
      },
    };
    const writer = createExportWriter({
      source: stuck,
      signal: new AbortController().signal,
      manifest: MANIFEST_INPUT,
      files: [CLIENTS],
    });
    writer.output.resume();
    await new Promise((resolve) => setTimeout(resolve, 100));

    const stopped = writer.stop().then(() => 'stopped');
    const early = await Promise.race([
      stopped,
      new Promise((resolve) => setTimeout(() => resolve('waiting'), 100)),
    ]);
    expect(early).toBe('waiting');

    release();
    expect(await stopped).toBe('stopped');
    expect(finished).toBe(true);
  });
});
