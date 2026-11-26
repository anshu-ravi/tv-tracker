import Link from "next/link";
import FriendsSheetButton from "@/components/FriendsSheetButton";
import ProfileAvatar from "@/components/ProfileAvatar";
import { toRating } from "@/lib/friendProfile";
import { friendStatusLabel, friendsSummary, type FriendOnTitleRow } from "@/lib/friendsContext";

// Friends tracking this title, as a one-line summary with the full list in a sheet.
export default function FriendsOnTitle({ rows, isMovie }: { rows: FriendOnTitleRow[]; isMovie: boolean }) {
  if (rows.length === 0) return null;
  const summary = friendsSummary(rows, isMovie);
  const ratingNote =
    summary.rating === null ? "" : ` · ${rows.length > 1 ? "avg " : ""}★ ${summary.rating.toFixed(1)}`;

  const avatars = rows.slice(0, 3).map((row, i) => (
    <span key={row.user_id} className={i > 0 ? "-ml-2" : ""}>
      <ProfileAvatar profile={row} size={28} />
    </span>
  ));

  return (
    <FriendsSheetButton avatars={avatars} text={`${summary.text}${ratingNote}`}>
      <ul className="divide-y-2 divide-ink/10">
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
                  <span className="shrink-0 border-2 border-ink bg-acid px-1.5 py-0.5 text-xs font-bold">
                    ★ {rating.toFixed(1)}
                  </span>
                )}
              </Link>
            </li>
          );
        })}
      </ul>
    </FriendsSheetButton>
  );
}
