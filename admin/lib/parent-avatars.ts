/** Deterministic friendly animal avatars for WhatsApp parents (INS-20 follow-up). */

export const PARENT_AVATARS = [
  { id: "fox", src: "/avatars/fox.png", label: "Fox" },
  { id: "red-panda", src: "/avatars/red-panda.png", label: "Red panda" },
  { id: "otter", src: "/avatars/otter.png", label: "Otter" },
  { id: "fennec", src: "/avatars/fennec.png", label: "Fennec" },
  { id: "bear", src: "/avatars/bear.png", label: "Bear" },
  { id: "wolf", src: "/avatars/wolf.png", label: "Wolf" },
  { id: "puppy", src: "/avatars/puppy.png", label: "Puppy" },
  { id: "raccoon", src: "/avatars/raccoon.png", label: "Raccoon" },
  { id: "owl", src: "/avatars/owl.png", label: "Owl" },
  { id: "penguin", src: "/avatars/penguin.png", label: "Penguin" },
  { id: "koala", src: "/avatars/koala.png", label: "Koala" },
  { id: "capybara", src: "/avatars/capybara.png", label: "Capybara" },
  { id: "deer", src: "/avatars/deer.png", label: "Deer" },
  { id: "squirrel", src: "/avatars/squirrel.png", label: "Squirrel" },
  { id: "tiger", src: "/avatars/tiger.png", label: "Tiger" },
] as const;

export type ParentAvatarInfo = (typeof PARENT_AVATARS)[number];

/**
 * Stable 0..N-1 slot from phone / WhatsApp id.
 * Same number always maps to the same animal across sessions.
 */
export function parentAvatarIndex(waFrom: string | null | undefined): number {
  const text = waFrom || "";
  let hash = 0;
  for (let i = 0; i < text.length; i += 1) {
    hash = (hash * 31 + text.charCodeAt(i)) >>> 0;
  }
  return hash % PARENT_AVATARS.length;
}

export function parentAvatar(waFrom: string | null | undefined): ParentAvatarInfo {
  return PARENT_AVATARS[parentAvatarIndex(waFrom)];
}
