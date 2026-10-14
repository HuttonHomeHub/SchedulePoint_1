import { createHash } from 'node:crypto';
import { Readable } from 'node:stream';

import { ZipFile } from 'yazl';

import { csvPath, EXPORT_FILES, jsonPath, type ExportFile } from './export-columns';
import {
  buildManifest,
  buildReadme,
  csvHeader,
  csvRecord,
  jsonArrayPrefix,
  jsonArraySuffix,
  jsonLine,
  type ExportRow,
  type ManifestFileEntry,
  type ManifestInput,
} from './export-serialise';

/**
 * The streaming ZIP writer for the organisation export (ADR-0194 D3).
 *
 * It knows the registry and nothing about the database or HTTP: rows arrive from an
 * {@link ExportPageSource}, ZIP bytes leave through {@link ExportWriter.output}. That keeps the
 * two properties worth testing in isolation — the ZIP's shape, and what happens when the source
 * fails half way.
 *
 * **One entry is open at a time, and each is built only when `yazl` reaches it.** `yazl` starts an
 * entry only after the previous one is finished (`index.js:219-235`) and calls the function given to
 * `addReadStreamLazy` at that moment (`index.js:59-78`), so a table is not read until the bytes
 * before it have been written. The entry's stream is piped through the compressor into the output
 * (`index.js:177-181`), and the compressor is `node:zlib`'s `DeflateRaw` (`index.js:175`), so deflate
 * runs on the libuv pool rather than the event loop. Together, that is the back-pressure: a slow
 * client stops the ZIP draining, which stops the entry stream reading, which stops the generator
 * below asking the database for the next page.
 *
 * **Sizes and ZIP64 are `yazl`'s job.** An entry of unknown size takes its length from a byte counter
 * once it ends (`index.js:184-186`), and an entry or central directory past 4 GB switches to ZIP64 by
 * itself (`index.js:491-498`, `index.js:318-327`); nothing here sizes anything in advance.
 *
 * **The manifest is the last entry and is built when `yazl` reaches it**, by which time every
 * earlier entry has finished and recorded its row count, size and SHA-256. Each data file is read
 * twice (once for its JSON, once for its CSV) because ZIP entries are written one after another;
 * the shared snapshot is what makes the two passes the same rows.
 */

/** Where the rows come from. One implementation reads the snapshot; a test supplies a fixture. */
export interface ExportPageSource {
  pages(file: ExportFile, signal: AbortSignal): AsyncIterable<ExportRow[]>;
}

export interface ExportWriterInput {
  readonly source: ExportPageSource;
  readonly signal: AbortSignal;
  readonly manifest: Omit<ManifestInput, 'files'>;
  /** Defaults to the whole registry; a test passes a subset. */
  readonly files?: readonly ExportFile[];
}

export interface ExportSummary {
  /** The entries the manifest lists. */
  readonly files: number;
  /** The records in the JSON files (the CSV files repeat them). */
  readonly rows: number;
  readonly entries: readonly ManifestFileEntry[];
}

export interface ExportWriter {
  /** The ZIP, as a stream. Destroyed with an error if a source fails. */
  readonly output: Readable;
  /** Valid once `output` has ended. */
  summary(): ExportSummary;
  /** Stop the open entry and wait until it is no longer reading, so the snapshot can end. */
  stop(): Promise<void>;
}

interface Counter {
  rows: number;
}

async function* jsonText(
  pages: AsyncIterable<ExportRow[]>,
  file: ExportFile,
  counter: Counter,
): AsyncGenerator<string> {
  for await (const rows of pages) {
    let text = '';
    for (const row of rows) {
      text += jsonArrayPrefix(counter.rows) + jsonLine(file, row);
      counter.rows += 1;
    }
    yield text;
  }
  yield jsonArraySuffix(counter.rows);
}

async function* csvText(
  pages: AsyncIterable<ExportRow[]>,
  file: ExportFile,
  counter: Counter,
): AsyncGenerator<string> {
  yield csvHeader(file);
  for await (const rows of pages) {
    let text = '';
    for (const row of rows) text += csvRecord(file, row);
    counter.rows += rows.length;
    yield text;
  }
}

export function createExportWriter(input: ExportWriterInput): ExportWriter {
  const files = input.files ?? EXPORT_FILES;
  const zip = new ZipFile();
  const entries: ManifestFileEntry[] = [];
  const mtime = input.manifest.generatedAt;
  // yazl's `outputStream` is a PassThrough typed as the narrower `ReadableStream`.
  const output = zip.outputStream as Readable;
  let open: Readable | undefined;

  /** One ZIP entry that measures what it writes, and records it when it ends cleanly. */
  const addMeasured = (
    path: string,
    file: ExportFile,
    kind: ManifestFileEntry['kind'],
    text: (counter: Counter) => AsyncIterable<string>,
  ): void => {
    zip.addReadStreamLazy(path, { mtime }, (done) => {
      const counter: Counter = { rows: 0 };
      const hash = createHash('sha256');
      let bytes = 0;
      const measured = async function* (): AsyncGenerator<Buffer> {
        for await (const chunk of text(counter)) {
          const buffer = Buffer.from(chunk, 'utf8');
          hash.update(buffer);
          bytes += buffer.length;
          yield buffer;
        }
        entries.push({
          path,
          file: file.file,
          kind,
          rows: counter.rows,
          bytes,
          sha256: hash.digest('hex'),
        });
      };
      const stream = Readable.from(measured(), { objectMode: false });
      // yazl does not listen for a failing entry stream (`index.js:177-181` pipes it and nothing
      // else), so without this the ZIP would simply never end.
      stream.on('error', (error) => output.destroy(error));
      open = stream;
      done(null, stream);
    });
  };

  zip.addBuffer(Buffer.from(buildReadme(), 'utf8'), 'README.txt', { mtime });
  for (const file of files) {
    addMeasured(jsonPath(file), file, 'json', (counter) =>
      jsonText(input.source.pages(file, input.signal), file, counter),
    );
    addMeasured(csvPath(file), file, 'csv', (counter) =>
      csvText(input.source.pages(file, input.signal), file, counter),
    );
  }
  zip.addReadStreamLazy('manifest.json', { mtime }, (done) => {
    const stream = Readable.from([
      Buffer.from(buildManifest({ ...input.manifest, files: entries }), 'utf8'),
    ]);
    open = stream;
    done(null, stream);
  });
  zip.end();

  return {
    output,
    summary: () => ({
      files: entries.length,
      rows: entries.filter((e) => e.kind === 'json').reduce((sum, e) => sum + e.rows, 0),
      entries,
    }),
    async stop() {
      const stream = open;
      if (stream === undefined) return;
      if (!stream.destroyed) stream.destroy();
      // `destroy()` returns before the generator has stopped: its `return()` queues behind a page
      // read already in flight. `close` is emitted only after that, which is what lets the caller end
      // the snapshot without a query still running on it.
      if (!stream.closed) await new Promise<void>((resolve) => stream.once('close', resolve));
    },
  };
}
