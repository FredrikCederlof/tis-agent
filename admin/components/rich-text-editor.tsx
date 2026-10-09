"use client";

import { useEffect, useRef } from "react";

const COMMANDS: { label: string; command: string; arg?: string }[] = [
  { label: "Paragraph", command: "formatBlock", arg: "P" },
  { label: "Heading", command: "formatBlock", arg: "H2" },
  { label: "Bold", command: "bold" },
  { label: "Italic", command: "italic" },
  { label: "Bullets", command: "insertUnorderedList" },
  { label: "Numbered", command: "insertOrderedList" },
];

export function RichTextEditor({
  value,
  onChange,
}: {
  value: string;
  onChange: (html: string) => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const loaded = useRef(false);

  useEffect(() => {
    if (!ref.current || loaded.current) return;
    ref.current.innerHTML = value;
    loaded.current = true;
  }, [value]);

  function emit() {
    onChange(ref.current?.innerHTML || "");
  }

  function run(command: string, arg?: string) {
    ref.current?.focus();
    document.execCommand(command, false, arg);
    emit();
  }

  function addLink() {
    const href = window.prompt("Link address", "https://");
    if (!href) return;
    run("createLink", href);
  }

  return (
    <div className="overflow-hidden rounded-2xl border border-black/[0.08] bg-white shadow-sm">
      <div className="flex flex-wrap gap-1 border-b border-black/[0.06] bg-stone-50 p-2">
        {COMMANDS.map((item) => (
          <button
            key={item.label}
            type="button"
            className="secondary !px-2.5 !py-1.5 !text-xs"
            onMouseDown={(event) => event.preventDefault()}
            onClick={() => run(item.command, item.arg)}
          >
            {item.label}
          </button>
        ))}
        <button
          type="button"
          className="secondary !px-2.5 !py-1.5 !text-xs"
          onMouseDown={(event) => event.preventDefault()}
          onClick={addLink}
        >
          Link
        </button>
      </div>
      <div
        ref={ref}
        className="min-h-[28rem] px-5 py-4 text-sm leading-relaxed text-tis-ink outline-none [&_a]:underline [&_h2]:mb-2 [&_h2]:mt-6 [&_h2]:text-lg [&_h2]:font-bold [&_ul]:list-disc [&_ul]:pl-5"
        contentEditable
        role="textbox"
        aria-multiline
        aria-label="Page text"
        suppressContentEditableWarning
        onInput={emit}
        onPaste={(event) => {
          event.preventDefault();
          const text = event.clipboardData.getData("text/plain");
          document.execCommand("insertText", false, text);
          emit();
        }}
      />
    </div>
  );
}
