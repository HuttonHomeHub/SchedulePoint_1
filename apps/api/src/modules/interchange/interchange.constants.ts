/**
 * Boundary constants for the schedule-interchange upload surface (ADR-0050, C2).
 *
 * The byte cap is a **hard safety boundary enforced at the HTTP edge**: it is passed to the multipart
 * interceptor's `limits.fileSize`, so Multer rejects an oversize upload mid-stream (→ 413) BEFORE the
 * whole file is buffered into memory or handed to the parser. The same value is passed to the pure
 * `@repo/interchange` parser caps as defence-in-depth. It is a compile-time constant (not env config)
 * deliberately — it guards process memory, so it must not depend on runtime configuration being present.
 */

/** The multipart form field the upload is read from. */
export const INTERCHANGE_FILE_FIELD = 'file';

/**
 * Maximum accepted upload size, in bytes (16 MiB). Comfortably above a 2,000-activity XER (the brief's
 * ceiling; tab-delimited text is compact) while bounding a memory-exhaustion upload. Tuned here rather
 * than in env so the boundary cannot be misconfigured away.
 */
export const INTERCHANGE_MAX_UPLOAD_BYTES = 16 * 1024 * 1024;
