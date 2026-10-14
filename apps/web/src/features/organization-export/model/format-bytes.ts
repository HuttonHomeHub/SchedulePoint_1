/**
 * A byte count in the units a person reads ("3.2 MB"), for the export's progress line. Decimal
 * (1 MB = 1,000,000 bytes) because that is what a download list and a file manager show, so the
 * number on this page matches the one beside the saved file.
 */
export function formatBytes(bytes: number): string {
  if (bytes < 1000) return `${bytes} B`;
  const units = ['kB', 'MB', 'GB'] as const;
  let value = bytes / 1000;
  let unit = 0;
  while (value >= 1000 && unit < units.length - 1) {
    value /= 1000;
    unit += 1;
  }
  return `${value.toFixed(1)} ${units[unit]}`;
}
