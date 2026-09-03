// Render WhatsApp-formatted replies as HTML — keep in sync with tis_agent/wa_markup.py.
// Tina writes *bold*, _italic_, ~strike~, `mono`, "- " bullets and blank-line paragraphs.

export type InlineKind = "text" | "bold" | "italic" | "strike" | "code";

export type InlineToken = {
  kind: InlineKind;
  text: string;
};

export type Block =
  | { type: "paragraph"; lines: InlineToken[][] }
  | { type: "list"; ordered: boolean; items: InlineToken[][] };

const BULLET = /^\s*[-•*]\s+(.*)$/;
const ORDERED = /^\s*(\d{1,2})[.)]\s+(.*)$/;

const INLINE: Array<{ kind: InlineKind; pattern: RegExp }> = [
  { kind: "code", pattern: /`([^`\n]+)`/ },
  { kind: "bold", pattern: /(?<![\w*])\*(?!\s)([^*\n]+?)(?<!\s)\*(?![\w*])/ },
  { kind: "italic", pattern: /(?<![\w_])_(?!\s)([^_\n]+?)(?<!\s)_(?![\w_])/ },
  { kind: "strike", pattern: /(?<![\w~])~(?!\s)([^~\n]+?)(?<!\s)~(?![\w~])/ },
];

export function tokenizeInline(text: string): InlineToken[] {
  const tokens: InlineToken[] = [];
  let rest = text;
  while (rest) {
    let bestKind: InlineKind | null = null;
    let bestMatch: RegExpMatchArray | null = null;
    for (const { kind, pattern } of INLINE) {
      const match = rest.match(pattern);
      if (match && match.index != null && (bestMatch?.index == null || match.index < bestMatch.index)) {
        bestKind = kind;
        bestMatch = match;
      }
    }
    if (!bestMatch || bestMatch.index == null || !bestKind) {
      tokens.push({ kind: "text", text: rest });
      break;
    }
    if (bestMatch.index > 0) {
      tokens.push({ kind: "text", text: rest.slice(0, bestMatch.index) });
    }
    tokens.push({ kind: bestKind, text: bestMatch[1] });
    rest = rest.slice(bestMatch.index + bestMatch[0].length);
  }
  return tokens.filter((token) => token.text);
}

export function parseBlocks(text: string): Block[] {
  const blocks: Block[] = [];
  let paragraph: string[] = [];

  function flushParagraph() {
    if (paragraph.length) {
      blocks.push({ type: "paragraph", lines: paragraph.map(tokenizeInline) });
      paragraph = [];
    }
  }

  for (const rawLine of (text || "").replace(/\r\n/g, "\n").split("\n")) {
    const line = rawLine.trimEnd();
    if (!line.trim()) {
      flushParagraph();
      continue;
    }

    const ordered = line.match(ORDERED);
    const bullet = ordered ? null : line.match(BULLET);
    if (ordered || bullet) {
      const item = ((ordered ? ordered[2] : bullet?.[1]) || "").trim();
      const isOrdered = Boolean(ordered);
      flushParagraph();
      const last = blocks[blocks.length - 1];
      if (last && last.type === "list" && last.ordered === isOrdered) {
        last.items.push(tokenizeInline(item));
      } else {
        blocks.push({ type: "list", ordered: isOrdered, items: [tokenizeInline(item)] });
      }
      continue;
    }

    paragraph.push(line.trim());
  }

  flushParagraph();
  return blocks;
}
