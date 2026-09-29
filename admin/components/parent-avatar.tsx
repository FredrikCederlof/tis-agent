import Image from "next/image";
import { parentAvatar } from "@/lib/parent-avatars";
import { parentMaskedId } from "@/lib/chats";

export function ParentAvatar({
  waFrom,
  size = 40,
}: {
  waFrom: string;
  size?: number;
}) {
  const avatar = parentAvatar(waFrom);
  const masked = parentMaskedId(waFrom);
  const label =
    masked === "Parent" ? `Parent · ${avatar.label}` : `Parent ${masked} · ${avatar.label}`;

  return (
    <span
      className="relative inline-flex shrink-0 overflow-hidden rounded-full bg-white"
      style={{
        width: size,
        height: size,
        border: "1px solid #EBEBEB",
        boxSizing: "border-box",
      }}
      title={label}
      aria-label={label}
    >
      {/*
        Art is a head-and-shoulders bust with transparent padding.
        Scale up + nudge down so the character fills the circle edge-to-edge
        (no empty band under the bust before the border).
      */}
      <Image
        src={avatar.src}
        alt=""
        width={size}
        height={size}
        className="pointer-events-none absolute left-1/2 top-1/2 max-w-none"
        style={{
          width: size * 1.55,
          height: size * 1.55,
          transform: "translate(-50%, -46%)",
        }}
        priority={size >= 48}
      />
    </span>
  );
}
