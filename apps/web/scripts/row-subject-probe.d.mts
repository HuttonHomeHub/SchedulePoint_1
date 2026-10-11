/** Types for `row-subject-probe.mjs`, so a TypeScript journey can import the one definition of "clipped". */
export interface RowPartReading {
  chars: number;
  shownChars: number;
  needsPx: number;
  shownPx: number;
  clippedRects: number;
  clipped: boolean;
  ellipsis: boolean;
  ellipsisTruncating: boolean;
  lineTops: number[];
}

export interface TrailingReading extends RowPartReading {
  text: string;
  primaryWidth: number;
  primaryChars: number;
  beneath: boolean;
  topAbovePrimaryBottom: boolean;
  centreInFirstLine: boolean;
}

export interface SubjectReading {
  region: string;
  text: string;
  hasBadge: boolean;
  hasContext: boolean;
  name: RowPartReading;
  context: RowPartReading;
  lines: number;
  trailing: TrailingReading | null;
  rowHeight: number | null;
}

export interface ProbeResult {
  found: number;
  docOverflowX: number;
  subjects: SubjectReading[];
}

export function probeRowSubjects(): ProbeResult;

export function summariseProbe(result: ProbeResult): Record<string, number>;
