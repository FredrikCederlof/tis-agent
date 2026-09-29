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
      }}
      title={label}
      aria-label={label}
    >
      {/* Scale past the circle so the bust fills edge-to-edge (no empty gap at the bottom). */}
      <Image
        src={avatar.src}
        alt=""
        width={size}
        height={size}
        className="h-full w-full object-cover"
        style={{
          transform: "scale(1.38)",
          transformOrigin: "center 42%",
        }}
        priority={size >= 48}
      />
    </span>
  );
}
