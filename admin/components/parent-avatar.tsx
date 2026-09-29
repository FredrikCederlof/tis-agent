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
      className="relative inline-flex shrink-0 overflow-hidden rounded-full bg-slate-900 ring-1 ring-black/10"
      style={{ width: size, height: size }}
      title={label}
      aria-label={label}
    >
      <Image
        src={avatar.src}
        alt=""
        width={size}
        height={size}
        className="h-full w-full object-cover"
        priority={size >= 48}
      />
    </span>
  );
}
