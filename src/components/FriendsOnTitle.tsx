import Link from "next/link";
import ProfileAvatar from "@/components/ProfileAvatar";
import { toRating } from "@/lib/friendProfile";
import { friendStatusLabel, type FriendOnTitleRow } from "@/lib/friendsContext";

// "Friends" strip on a title page: each friend who tracks it, with their status and rating.
export default function FriendsOnTitle({ rows, isMovie }: { rows: FriendOnTitleRow[]; isMovie: boolean }) {
  if (rows.length === 0) return null;

  return (
    <section className="px-4 pt-4">
      <h2 className="display mb-2 text-lg">Friends</h2>
      <ul className="card-bold divide-y-2 divide-ink/10 px-3">
        {rows.map((row) => {
          const rating = toRating(row.rating);
          return (
            <li key={row.user_id}>
              <Link href={`/u/${row.handle}`} className="flex items-center gap-3 py-2">
                <ProfileAvatar profile={row} size={36} />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-bold">{row.display_name || row.handle}</p>
                  <p className="truncate text-[10px] font-bold uppercase tracking-wide text-ink-soft">
                    {friendStatusLabel(row, isMovie)}
                  </p>
                </div>
                {rating !== null && (
                  <span className="shrink-0 rotate-3 border-2 border-ink bg-acid px-1.5 py-0.5 text-xs font-bold">
                    ★ {rating.toFixed(1)}
                  </span>
                )}
              </Link>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
