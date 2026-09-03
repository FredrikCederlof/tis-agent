import { Fragment } from "react";
import { parseBlocks, type InlineToken } from "@/lib/wa-markup";

function Inline({ tokens }: { tokens: InlineToken[] }) {
  return (
    <>
      {tokens.map((token, index) => {
        const key = `${token.kind}-${index}`;
        if (token.kind === "bold") return <strong key={key}>{token.text}</strong>;
        if (token.kind === "italic") return <em key={key}>{token.text}</em>;
        if (token.kind === "strike") return <s key={key}>{token.text}</s>;
        if (token.kind === "code") {
          return (
            <code key={key} className="rounded bg-black/10 px-1 py-0.5 text-[0.9em]">
              {token.text}
            </code>
          );
        }
        return <Fragment key={key}>{token.text}</Fragment>;
      })}
    </>
  );
}

/** Tina writes for WhatsApp; Admin shows the same text as paragraphs and lists. */
export function WaMessage({ text, className = "" }: { text: string; className?: string }) {
  const blocks = parseBlocks(text);
  if (blocks.length === 0) return null;

  return (
    <div className={`space-y-2 leading-relaxed ${className}`}>
      {blocks.map((block, blockIndex) => {
        if (block.type === "list") {
          const ListTag = block.ordered ? "ol" : "ul";
          return (
            <ListTag
              key={`list-${blockIndex}`}
              className={`space-y-1 pl-5 ${block.ordered ? "list-decimal" : "list-disc"}`}
            >
              {block.items.map((item, itemIndex) => (
                <li key={`item-${itemIndex}`} className="pl-0.5">
                  <Inline tokens={item} />
                </li>
              ))}
            </ListTag>
          );
        }
        return (
          <p key={`p-${blockIndex}`}>
            {block.lines.map((line, lineIndex) => (
              <Fragment key={`line-${lineIndex}`}>
                {lineIndex > 0 && <br />}
                <Inline tokens={line} />
              </Fragment>
            ))}
          </p>
        );
      })}
    </div>
  );
}
