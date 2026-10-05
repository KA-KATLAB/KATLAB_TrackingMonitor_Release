// TypeScript preserves native newlines in JSX text even with a LineFeed printer.
// Canonicalize only physical CRLF; escaped characters and bare CR stay distinct.
export function canonicalPrintedText (text) {
  return text.replace(/\r\n/g, "\n");
}
