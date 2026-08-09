import { createHash } from 'node:crypto';

import { Injectable } from '@nestjs/common';
import { InjectPinoLogger, PinoLogger } from 'nestjs-pino';

import { PrismaService } from '../../prisma/prisma.service';

import type { NormalisedCspReport } from './csp-report-body';

/**
 * The dedup key: SHA-256 of the four identifying values.
 *
 * **`disposition` is in the key, and the reason is that conflation and fragmentation are not
 * symmetric failures.** Left out, a violation seen 500 times during a report-only window and once
 * after enforcement collapses into one row reading `count = 501, disposition = 'enforce'` — which
 * says 501 people were blocked when one was, on precisely the transition this table exists to
 * inform, and a reader cannot recover the truth from it. Put in, the worst case is the same
 * violation split across rows that a reader can add up.
 *
 * One error is invisible and overstates harm; the other is visible and additive. Safe means erring
 * toward the recoverable one.
 *
 * The accepted cost is that a `null` disposition — the legacy body carries none in every engine —
 * is its own bucket, so one violation observed during one phase by two different browsers can be
 * two rows. That is the same fragmentation, in its mildest form, and it is still the safe
 * direction: two rows that add up beat one row that overstates.
 *
 * It costs **no migration**: the hash is computed by this service, so the column and index are
 * unchanged. Existing rows simply stop matching and deduplication restarts — harmless on telemetry
 * that is retention-bounded anyway, and stated so nobody reads the discontinuity as data loss.
 *
 * **Hashed rather than indexed directly**, because a btree index row caps near 2704 bytes and both
 * URI values arrive from an unauthenticated POST. An 8 KB `blocked_uri` indexed directly would make
 * the INSERT *fail* rather than deduplicate — so a hostile report could deny the reporting this
 * table exists to collect. Verified against the real database: two 8 KB reports produce one row
 * with `count = 2`.
 *
 * The separator is `\u001f`, not `|`. The first version used `|` and argued a collision was
 * harmless; it is not quite — `('a|b', 'c')` and `('a', 'b|c')` join identically, so two genuinely
 * different violations would share one row and one count, on a table an operator reads to decide
 * what to fix. A control character cannot occur in a directive name or a URI, so the join is
 * unambiguous, and it costs one character.
 */
export function dedupeHashOf(report: NormalisedCspReport): string {
  return (
    createHash('sha256')
      // `\u001f` (UNIT SEPARATOR) rather than `|`, which can occur in a URL: `('a|b','c')` and
      // `('a','b|c')` join to the same string and would share a row. The control character cannot
      // appear in a directive name or a URI, so the join is unambiguous for one character's cost.
      .update(
        [
          report.effectiveDirective,
          report.blockedUri,
          report.documentUri,
          // `disposition` IS part of the identity — see the docblock.
          report.disposition ?? '',
        ].join('\u001f'),
      )
      .digest('hex')
  );
}

/**
 * Records violation reports, deduplicated.
 *
 * **Swallows everything.** The endpoint answers 204 regardless of what happens here, so a failed
 * write must not become a 500 on a public route — that is both an availability problem and a signal
 * to a prober that their input was interesting. A dropped report costs one row of telemetry; a 500
 * on an unauthenticated endpoint costs more.
 */
@Injectable()
export class CspReportService {
  constructor(
    private readonly prisma: PrismaService,
    @InjectPinoLogger(CspReportService.name) private readonly logger: PinoLogger,
  ) {}

  /**
   * **Sequential and one statement per report, deliberately — this reads like an oversight and is
   * not one.** Both properties were re-derived and measured by the M6 backend-performance review;
   * recorded here because the next reader's instinct will be to batch it.
   *
   * - `await` in a loop rather than `Promise.all`, for **pool discipline**. Sequentially, one CSP
   *   POST holds exactly one Prisma connection whatever the batch size. Concurrently it would take
   *   up to {@link MAX_REPORTS_PER_REQUEST}, on a **public, unauthenticated** endpoint — the
   *   difference between many IPs posting harmlessly and twenty of them starving the pool.
   * - One statement per report, for **fault isolation** — and the obvious multi-row rewrite is a
   *   correctness regression, verified against this schema rather than assumed: two reports in one
   *   batch sharing a `dedupe_hash` (the Reporting API can queue duplicates before a flush) make
   *   Postgres raise `ON CONFLICT DO UPDATE command cannot affect row a second time`, and because
   *   this endpoint swallows write failures to answer 204, that would silently drop the **whole**
   *   batch instead of one row. A correct batched version needs a `GROUP BY dedupe_hash` CTE first.
   *
   * The measured prize for getting all that right is 3–5 ms per maximal batch on a same-host
   * database (~7–8 ms sequential against 3.2 ms batched, 20 rows), which is not worth the risk.
   */
  async record(reports: readonly NormalisedCspReport[]): Promise<void> {
    for (const report of reports) {
      try {
        const dedupeHash = dedupeHashOf(report);
        // **Raw SQL, and `now()` on BOTH branches — which is the fix for a defect that lost
        // reports.** The Prisma `upsert` this replaced was correct about the unique index and wrong
        // about the clock: `first_seen_at` was stamped by the engine as it built the INSERT, while
        // the DO UPDATE branch used a `new Date()` taken ~1 ms EARLIER in this process. The loser
        // of an insert race therefore tried to write a `last_seen_at` older than the winner's
        // `first_seen_at`, `ck_csp_reports_seen_order` refused it, and the write was swallowed.
        //
        // Measured before the fix: a burst of 16 concurrent reports of a NEW violation recorded
        // `count = 1` — fifteen lost. Repeats against an existing row were always fine, so the loss
        // fell entirely on a violation's FIRST burst: exactly when a newly-shipped policy breaks
        // something for several people at once, and exactly the count that decides whether to
        // enforce. One database clock removes the whole class.
        await this.prisma.$executeRaw`
          INSERT INTO csp_reports (
            id, dedupe_hash, effective_directive, blocked_uri, document_uri,
            disposition, source_file, line_number, column_number,
            count, first_seen_at, last_seen_at
          ) VALUES (
            gen_random_uuid(), ${dedupeHash}, ${report.effectiveDirective}, ${report.blockedUri},
            ${report.documentUri}, ${report.disposition}, ${report.sourceFile},
            ${report.lineNumber}, ${report.columnNumber}, 1, now(), now()
          )
          ON CONFLICT (dedupe_hash) DO UPDATE SET
            count = csp_reports.count + 1,
            last_seen_at = now(),
            -- Last-writer-wins on the three non-key columns: they are not part of the identity, and
            -- one worked example of where the code was is all they need to be. COALESCE so a later
            -- report that omitted them cannot erase what an earlier one supplied.
            --
            -- **The hostile reading, stated because the endpoint is unauthenticated.** Anyone who
            -- can reproduce an existing row's four key fields — all four are observable from the
            -- page that produced the violation — can replace its recorded source location with
            -- values of their choosing. The ceiling is misdirection of an investigation: the
            -- values are capped at 1,024 characters, stored as text and rendered as text, so there
            -- is no injection and nothing is disclosed. Accepted rather than closed, because the
            -- alternatives are first-writer-wins (which pins the row to whichever report arrived
            -- first, usually the least informative) or keying on the location too (which shatters
            -- one violation into a row per call site — the fragmentation the dedupe key exists to
            -- prevent). Treat a source location here as a lead, never as evidence.
            disposition = COALESCE(EXCLUDED.disposition, csp_reports.disposition),
            source_file = COALESCE(EXCLUDED.source_file, csp_reports.source_file),
            line_number = COALESCE(EXCLUDED.line_number, csp_reports.line_number),
            column_number = COALESCE(EXCLUDED.column_number, csp_reports.column_number)
        `;
      } catch (error) {
        this.logger.warn(
          // The directive only. The URIs are the untrusted part, and a log line is a second copy
          // of them in a stream with different retention from the table this decides not to write.
          { event: 'csp_report.persist_failed', err: error, directive: report.effectiveDirective },
          'could not record a CSP violation report',
        );
      }
    }
  }
}
