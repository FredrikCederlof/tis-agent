import { parentColor, parentColorIndex, parentMaskedId } from "@/lib/chats";

const GLYPH_COUNT = 8;

/** Abstract geometric mark — index is stable for the same wa_from. */
function Glyph({ index, size }: { index: number; size: number }) {
  const stroke = Math.max(1.5, size * 0.06);
  const common = {
    fill: "none",
    stroke: "currentColor",
    strokeWidth: stroke,
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const,
  };
  const i = ((index % GLYPH_COUNT) + GLYPH_COUNT) % GLYPH_COUNT;
  switch (i) {
    case 0:
      return (
        <svg viewBox="0 0 32 32" width={size * 0.55} height={size * 0.55} aria-hidden>
          <circle cx="16" cy="16" r="9" {...common} />
          <circle cx="16" cy="16" r="3" fill="currentColor" stroke="none" />
        </svg>
      );
    case 1:
      return (
        <svg viewBox="0 0 32 32" width={size * 0.55} height={size * 0.55} aria-hidden>
          <rect x="7" y="7" width="18" height="18" rx="3" {...common} />
        </svg>
      );
    case 2:
      return (
        <svg viewBox="0 0 32 32" width={size * 0.55} height={size * 0.55} aria-hidden>
          <path d="M16 5 L27 25 H5 Z" {...common} />
        </svg>
      );
    case 3:
      return (
        <svg viewBox="0 0 32 32" width={size * 0.55} height={size * 0.55} aria-hidden>
          <path d="M16 6 L26 16 L16 26 L6 16 Z" {...common} />
        </svg>
      );
    case 4:
      return (
        <svg viewBox="0 0 32 32" width={size * 0.55} height={size * 0.55} aria-hidden>
          <path d="M8 16 H24 M16 8 V24" {...common} />
          <circle cx="16" cy="16" r="8" {...common} />
        </svg>
      );
    case 5:
      return (
        <svg viewBox="0 0 32 32" width={size * 0.55} height={size * 0.55} aria-hidden>
          <path d="M6 22 L16 6 L26 22 Z" {...common} />
          <path d="M10 22 H22" {...common} />
        </svg>
      );
    case 6:
      return (
        <svg viewBox="0 0 32 32" width={size * 0.55} height={size * 0.55} aria-hidden>
          <rect x="6" y="10" width="20" height="14" rx="2" {...common} />
          <path d="M10 10 V8 A6 6 0 0 1 22 8 V10" {...common} />
        </svg>
      );
    default:
      return (
        <svg viewBox="0 0 32 32" width={size * 0.55} height={size * 0.55} aria-hidden>
          <path d="M8 8 H24 V24 H8 Z" {...common} />
          <path d="M8 16 H24 M16 8 V24" {...common} />
        </svg>
      );
  }
}

export function parentGlyphIndex(waFrom: string | null | undefined): number {
  // Offset from color index so glyph and fill aren't locked 1:1.
  return (parentColorIndex(waFrom) * 3 + 1) % GLYPH_COUNT;
}

export function ParentAvatar({
  waFrom,
  size = 40,
}: {
  waFrom: string;
  size?: number;
}) {
  const masked = parentMaskedId(waFrom);
  return (
    <span
      className="inline-flex shrink-0 items-center justify-center rounded-full text-white"
      style={{
        width: size,
        height: size,
        backgroundColor: parentColor(waFrom),
      }}
      title={masked}
      aria-label={masked === "Parent" ? "Parent" : `Parent ${masked}`}
    >
      <Glyph index={parentGlyphIndex(waFrom)} size={size} />
    </span>
  );
}
