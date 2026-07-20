/**
 * The shape of a Multer memory-storage upload the interchange controller consumes. The repo has no
 * `@types/multer` (so the global `Express.Multer.File` augmentation is unavailable); this minimal,
 * explicit interface captures exactly the fields the feature reads — the in-memory `buffer`, the
 * declared `size`, and the display-only `originalname`/`mimetype`. The filename is used for the report
 * only, never as a filesystem path.
 */
export interface UploadedInterchangeFile {
  /** The uploaded file's original name on the client (display/report only — never a path). */
  readonly originalname: string;
  /** The declared MIME type of the upload. */
  readonly mimetype: string;
  /** Size of the buffered file in bytes. */
  readonly size: number;
  /** The full file contents (Multer memory storage). */
  readonly buffer: Buffer;
}
