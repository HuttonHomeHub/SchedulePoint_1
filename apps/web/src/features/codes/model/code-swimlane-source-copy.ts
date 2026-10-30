/**
 * Why Delete… is shaded in Codes… for the code type the plan's swimlanes are made from. Lives in the
 * codes feature, which may not import swimlanes; the server's 409 for a stale client is worded in
 * `code-errors.ts` to the same sentence.
 */
export const codeTypeDeleteBlockedReason = (typeName: string): string =>
  `The swimlanes are made from ${typeName}. Choose another swimlane source first.`;
