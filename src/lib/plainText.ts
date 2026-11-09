/**
 * Turn an AI reply into plain, easy-to-read text.
 *
 * The chat shows plain text, so markdown (bold **stars**, # headings, tables, code
 * blocks, links) would show up as stray symbols. This keeps the words and simple
 * "• " bullets, and drops the rest.
 */
export function plainText(input: string): string {
  let s = String(input ?? '').replace(/\r\n?/g, '\n');

  // Code fences: keep the code text, drop the ``` lines.
  s = s.replace(/```[a-zA-Z0-9_-]*\n?/g, '');
  // Table separator rows like |---|:---:|
  s = s.replace(/^[ \t]*\|?[ \t]*:?-{2,}:?[ \t]*(\|[ \t]*:?-{2,}:?[ \t]*)*\|?[ \t]*$/gm, '');
  // Table rows: "| a | b |" -> "a · b"
  s = s.replace(/^[ \t]*\|(.+)\|[ \t]*$/gm, (_m, row: string) =>
    row
      .split('|')
      .map((c) => c.trim())
      .filter(Boolean)
      .join(' · '),
  );
  // Headings and block quotes
  s = s.replace(/^[ \t]{0,3}#{1,6}[ \t]+/gm, '');
  s = s.replace(/^[ \t]{0,3}>[ \t]?/gm, '');
  // Horizontal rules
  s = s.replace(/^[ \t]*([-*_])([ \t]*\1){2,}[ \t]*$/gm, '');
  // Bullets (-, *, +) -> "• "
  s = s.replace(/^([ \t]*)[-*+][ \t]+/gm, '$1• ');
  // Links and images: keep the label
  s = s.replace(/!?\[([^\]]*)\]\([^)]*\)/g, '$1');
  // Bold / italic / strike / inline code markers
  s = s.replace(/\*\*\*(.+?)\*\*\*/g, '$1');
  s = s.replace(/\*\*(.+?)\*\*/g, '$1');
  s = s.replace(/__(.+?)__/g, '$1');
  s = s.replace(/(^|[\s(])\*(?!\s)([^*\n]+?)\*(?=[\s).,!?:;]|$)/g, '$1$2');
  s = s.replace(/(^|[\s(])_(?!\s)([^_\n]+?)_(?=[\s).,!?:;]|$)/g, '$1$2');
  s = s.replace(/~~(.+?)~~/g, '$1');
  s = s.replace(/`([^`]+)`/g, '$1');
  // Any leftover runs of ** or ##
  s = s.replace(/\*{2,}/g, '').replace(/(^|\s)#{2,}(?=\s)/g, '$1');
  // Tidy spacing
  s = s.replace(/[ \t]+$/gm, '').replace(/\n{3,}/g, '\n\n');
  return s.trim();
}
