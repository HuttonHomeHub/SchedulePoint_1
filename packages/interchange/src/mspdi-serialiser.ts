/**
 * The **pure MSPDI serialiser** (ADR-0050 M4b, Task 4b.3) — the byte-level inverse of {@link parseMspdi}.
 * It turns the structured element tree the emitter builds ({@link MspdiNode}) into the Microsoft Project
 * MSPDI XML a file is: an XML declaration, then a single `<Project xmlns="…">` root carrying the
 * `<Calendars>` / `<Tasks>` vocabulary, encoded as UTF-8.
 *
 * **Encoding choice.** MSPDI is XML, whose default (and Project's own) encoding is UTF-8; we emit UTF-8 and
 * advertise it in the declaration so {@link parseMspdi} (which honours a BOM/declaration and otherwise
 * defaults to UTF-8) re-reads it byte-exact and **no character is ever lost to a codepage substitution** —
 * the round-trip-clean choice for arbitrary plan text.
 *
 * **Escaping (the security-critical bit).** All leaf text is XML-escaped — `&`→`&amp;`, `<`→`&lt;`,
 * `>`→`&gt;`, `"`→`&quot;` (ampersand first, so a literal `&` is never double-encoded) — so untrusted plan
 * text (an activity name containing `</Task>` or a bare `&`) can never break out of its element and inject
 * structure. Element **names** are internal constants (never user input) and are emitted verbatim; only
 * user-derived leaf values are escaped. The emitted document is therefore always well-formed and re-parses
 * cleanly. Note {@link parseMspdi} deliberately disables entity processing (an anti-entity-expansion
 * hardening), so an escaped special char re-reads in its **encoded** form (`&amp;`) rather than being
 * decoded — the value is safe and inert, and the document structure survives intact; this is documented as
 * a best-effort coercion in the mapping contract.
 *
 * No external XML library is used to *emit* (we build strings), but the output MUST re-parse via the real
 * `fast-xml-parser`-based {@link parseMspdi}. It is pure and deterministic: no I/O, clock or randomness.
 */

/** A node in the MSPDI element tree: a text leaf `<Name>text</Name>` or a branch `<Tasks>…children…</Tasks>`. */
export type MspdiNode =
  | { readonly kind: 'leaf'; readonly name: string; readonly text: string }
  | { readonly kind: 'branch'; readonly name: string; readonly children: readonly MspdiNode[] };

/** A text-leaf element `<name>text</name>`. */
export function leaf(name: string, text: string): MspdiNode {
  return { kind: 'leaf', name, text };
}

/** A branch element `<name>…children…</name>`. */
export function branch(name: string, children: readonly MspdiNode[]): MspdiNode {
  return { kind: 'branch', name, children };
}

/** Everything needed to serialise a full MSPDI document: the `<Project>` root element the emitter built. */
export interface MspdiSerialiseInput {
  /** The `<Project>` root node; the serialiser stamps the MS Project namespace onto it. */
  readonly root: MspdiNode;
}

/** The MS Project XML namespace that signs an MSPDI file (matches the parser's signature check). */
const MSP_NAMESPACE = 'http://schemas.microsoft.com/project';

/**
 * XML-escape a leaf text value so untrusted plan text can never break the document structure. `&` is
 * replaced first so an already-escaped entity is never double-encoded's victim (a subsequent pass would
 * otherwise turn the `&` of `&lt;` into `&amp;lt;`).
 */
function escapeXml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/** Render one node (and its subtree) to XML text. `namespace`, when set, is added as `xmlns` on this node. */
function renderNode(node: MspdiNode, namespace: string | null): string {
  const attrs = namespace === null ? '' : ` xmlns="${namespace}"`;
  if (node.kind === 'leaf') {
    // A leaf never carries the namespace (only the root does), so `attrs` is empty here in practice.
    return `<${node.name}${attrs}>${escapeXml(node.text)}</${node.name}>`;
  }
  const inner = node.children.map((child) => renderNode(child, null)).join('');
  return `<${node.name}${attrs}>${inner}</${node.name}>`;
}

/** Serialise a `<Project>` root into MSPDI XML bytes (UTF-8). Pure + deterministic. */
export function serialiseMspdi(input: MspdiSerialiseInput): Uint8Array {
  const declaration = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>';
  const body = renderNode(input.root, MSP_NAMESPACE);
  return new TextEncoder().encode(`${declaration}\n${body}\n`);
}
