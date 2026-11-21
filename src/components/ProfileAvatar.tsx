import Image from "next/image";
import type { Profile } from "@/lib/friends";

type Props = {
  profile: Pick<Profile, "display_name" | "handle" | "avatar_url">;
  size?: number;
};

export default function ProfileAvatar({ profile, size = 40 }: Props) {
  const initial = (profile.display_name || profile.handle || "?").charAt(0).toUpperCase();
  const style = { width: size, height: size };

  if (profile.avatar_url) {
    return (
      <div
        className="relative shrink-0 overflow-hidden border-[3px] border-ink bg-panel"
        style={style}
      >
        <Image
          src={profile.avatar_url}
          alt=""
          fill
          sizes={`${size}px`}
          className="object-cover"
        />
      </div>
    );
  }
  return (
    <div
      className="flex shrink-0 items-center justify-center border-[3px] border-ink bg-acid"
      style={style}
    >
      <span className="display" style={{ fontSize: size * 0.4 }}>
        {initial}
      </span>
    </div>
  );
}
