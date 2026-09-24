"use client";

type GlassToggleProps = {
  checked: boolean;
  onCheckedChange: (next: boolean) => void;
  disabled?: boolean;
  "aria-label": string;
};

/** Compact pill switch. ON: #054F3B. OFF: light gray. */
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
        "relative h-[31px] w-[51px] shrink-0 rounded-full",
        "transition-colors duration-200 ease-out",
        "focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-tis-navy",
        "disabled:cursor-not-allowed disabled:opacity-45",
        checked ? "bg-[#054F3B]" : "bg-[#E5E7EB]",
      ].join(" ")}
    >
      <span
        aria-hidden
        className={[
          "absolute top-[2px] left-[2px] h-[27px] w-[27px] rounded-full bg-white",
          "shadow-[0_1px_3px_rgba(0,0,0,0.18)]",
          "transition-transform duration-200 ease-out",
          checked ? "translate-x-[20px]" : "translate-x-0",
        ].join(" ")}
      />
    </button>
  );
}
