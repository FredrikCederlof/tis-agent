"use client";

type GlassToggleProps = {
  checked: boolean;
  onCheckedChange: (next: boolean) => void;
  disabled?: boolean;
  "aria-label": string;
};

/**
 * Compact Apple Liquid Glass-style switch.
 * ON uses translucent Tina racing green; OFF uses frosted white glass.
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
        "glass-toggle relative h-[31px] w-[51px] shrink-0 rounded-full",
        "border border-white/55 backdrop-blur-md",
        "shadow-[0_2px_10px_rgba(26,25,27,0.07),inset_0_1px_0_rgba(255,255,255,0.65)]",
        "transition-[background-color,box-shadow] duration-300",
        "ease-[cubic-bezier(0.22,1,0.36,1)]",
        "focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-tis-navy",
        "disabled:cursor-not-allowed disabled:opacity-45",
        checked
          ? "bg-[color-mix(in_srgb,#05513D_78%,transparent)]"
          : "bg-white/50",
      ].join(" ")}
    >
      <span
        aria-hidden
        className={[
          "pointer-events-none absolute top-[2px] left-[2px] h-[25px] w-[25px] rounded-full",
          "bg-gradient-to-b from-white to-[#f3f3f0]",
          "shadow-[0_2px_5px_rgba(26,25,27,0.18),0_1px_1px_rgba(26,25,27,0.06),inset_0_1px_0_rgba(255,255,255,0.95)]",
          "transition-transform duration-300",
          "ease-[cubic-bezier(0.34,1.45,0.64,1)]",
          checked ? "translate-x-[20px]" : "translate-x-0",
        ].join(" ")}
      />
    </button>
  );
}
