/**
 * Parse the download filename out of a `Content-Disposition` header, falling back to `fallback` when the
 * header is absent or carries no usable filename. Handles the RFC 5987 `filename*=UTF-8''…` form (URL-
 * decoded, preferred), a quoted `filename="…"`, and a bare unquoted `filename=…`. Pure — no DOM/network.
 */
export function parseContentDispositionFilename(
  header: string | null | undefined,
  fallback: string,
): string {
  if (!header) return fallback;
  const extended = /filename\*=\s*(?:UTF-8'')?([^;]+)/i.exec(header);
  if (extended?.[1]) {
    const raw = extended[1].trim().replace(/^"|"$/g, '');
    try {
      const decoded = decodeURIComponent(raw);
      if (decoded) return decoded;
    } catch {
      // Malformed percent-encoding — fall through to the plain forms below.
    }
  }
  const quoted = /filename="([^"]*)"/i.exec(header);
  if (quoted && quoted[1]) return quoted[1];
  const unquoted = /filename=\s*([^;]+)/i.exec(header);
  if (unquoted?.[1]) {
    const trimmed = unquoted[1].trim().replace(/^"|"$/g, '');
    if (trimmed) return trimmed;
  }
  return fallback;
}
