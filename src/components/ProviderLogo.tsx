import Image from "next/image";
import type { WatchProvider } from "@/lib/watchSettings";

// A streaming service's square logo, or its initials when TMDB has none.
export default function ProviderLogo({ provider, size }: { provider: WatchProvider; size: number }) {
  return (
    <div
      className="relative shrink-0 overflow-hidden rounded-[8px] border-2 border-ink bg-panel"
      style={{ width: size, height: size }}
    >
      {provider.logoUrl ? (
        <Image src={provider.logoUrl} alt={provider.name} fill sizes={`${size}px`} className="object-cover" unoptimized />
      ) : (
        <span className="flex h-full items-center justify-center text-[9px] font-bold uppercase">
          {provider.name.slice(0, 2)}
        </span>
      )}
    </div>
  );
}
