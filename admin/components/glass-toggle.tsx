"use client";

type GlassToggleProps = {
  checked: boolean;
  onCheckedChange: (next: boolean) => void;
  disabled?: boolean;
  "aria-label": string;
};

/**
 * Compact Apple Liquid Glass-style switch.
 * ON: translucent Tina racing green. OFF: frosted white glass.
 */
export function GlassToggle({
  checked,
  onCheckedChange,
  disabled = false,
  "aria-label": ariaLabel,
}: GlassToggleProps) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={ariaLabel}
      disabled={disabled}
      onClick={() => {
        if (!disabled) onCheckedChange(!checked);
      }}
      className={[
        "glass-toggle relative isolate h-[31px] w-[51px] shrink-0 overflow-hidden rounded-full",
        "border border-white/70",
        "shadow-[0_1px_2px_rgba(26,25,27,0.06),0_4px_12px_rgba(26,25,27,0.08),inset_0_1px_0_rgba(255,255,255,0.75),inset_0_-1px_1px_rgba(26,25,27,0.06)]",
        "backdrop-blur-[10px] backdrop-saturate-150",
        "transition-[background-color,box-shadow,border-color] duration-300",
        "ease-[cubic-bezier(0.22,1,0.36,1)]",
        "focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-tis-navy",
        "disabled:cursor-not-allowed disabled:opacity-45",
        checked
          ? "border-[#05513D]/25 bg-[color-mix(in_srgb,#05513D_68%,white)]"
          : "bg-[color-mix(in_srgb,white_55%,transparent)]",
      ].join(" ")}
    >
      {/* Soft glass sheen */}
      <span
        aria-hidden
        className="pointer-events-none absolute inset-0 rounded-full bg-gradient-to-b from-white/45 via-transparent to-black/[0.04]"
      />
      <span
        aria-hidden
        className={[
          "pointer-events-none absolute top-[2px] left-[2px] z-10 h-[25px] w-[25px] rounded-full",
          "bg-gradient-to-b from-white via-[#fbfbfa] to-[#ecece8]",
          "border border-white/80",
          "shadow-[0_2px_6px_rgba(26,25,27,0.2),0_1px_1px_rgba(26,25,27,0.08),inset_0_1px_0_rgba(255,255,255,1),inset_0_-1px_1px_rgba(26,25,27,0.04)]",
          "transition-transform duration-300",
          "ease-[cubic-bezier(0.34,1.45,0.64,1)]",
          "will-change-transform",
          checked ? "translate-x-[20px]" : "translate-x-0",
        ].join(" ")}
      />
    </button>
  );
}
