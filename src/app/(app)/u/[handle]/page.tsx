import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { loadFriendsState, normalizeHandle, PROFILE_COLUMNS, relationTo, type Profile } from "@/lib/friends";
import {
  filterByMedia,
  groupByStatus,
  groupLists,
  MEDIA_FILTERS,
  parseMediaFilter,
  parseTab,
  profileCounts,
  PROFILE_TABS,
  toCard,
  topRated,
  type FriendCardTitle,
  type FriendLibraryRow,
  type FriendListRow,
  type MediaFilter,
  type ProfileTab,
} from "@/lib/friendProfile";
import { compareLibraries, matchBasis, matchLabel, type RatedPair } from "@/lib/tasteCompare";
import { BUCKET_ORDER } from "@/components/BucketSection";
import BackButton from "@/components/BackButton";
import ProfileAvatar from "@/components/ProfileAvatar";
import FriendshipButton from "@/components/FriendshipButton";
import FriendTitleCard from "@/components/FriendTitleCard";
import type { WatchStatus } from "@/lib/types";

function hrefFor(handle: string, tab: ProfileTab, type: MediaFilter) {
  const params = new URLSearchParams();
  if (tab !== "top") params.set("tab", tab);
  if (type !== "all") params.set("type", type);
  const qs = params.toString();
  return `/u/${handle}${qs ? `?${qs}` : ""}`;
}

function Grid({
  titles,
  mine,
  muted = false,
}: {
  titles: FriendCardTitle[];
  mine: Map<string, WatchStatus>;
  muted?: boolean;
}) {
  return (
    <div className="grid grid-cols-3 gap-2">
      {titles.map((t) => (
        <FriendTitleCard key={t.id} title={t} myStatus={mine.get(t.id) ?? null} muted={muted} />
      ))}
    </div>
  );
}

function PairList({ pairs }: { pairs: RatedPair[] }) {
  return (
    <ul className="card-bold divide-y-2 divide-ink/10 px-3">
      {pairs.map((p) => (
        <li key={p.title.id} className="flex items-center gap-3 py-2">
          <Link href={`/title/${p.title.id}`} className="min-w-0 flex-1 truncate text-sm font-bold">
            {p.title.title}
          </Link>
          <span className="shrink-0 text-[10px] font-bold uppercase tracking-wide">
            You <span className="border-2 border-ink bg-acid px-1">{p.mine.toFixed(1)}</span>
          </span>
          <span className="shrink-0 text-[10px] font-bold uppercase tracking-wide">
            Them <span className="border-2 border-ink bg-paper px-1">{p.theirs.toFixed(1)}</span>
          </span>
        </li>
      ))}
    </ul>
  );
}

function Section({ title, count, children }: { title: string; count: number; children: React.ReactNode }) {
  return (
    <section>
      <div className="mb-3 flex items-baseline gap-2">
        <h2 className="display text-xl">{title}</h2>
        <span className="stamp text-[10px]">{count}</span>
      </div>
      {children}
    </section>
  );
}

function Empty({ children }: { children: React.ReactNode }) {
  return <p className="card-bold px-4 py-6 text-center text-sm text-ink-soft">{children}</p>;
}

export default async function ProfilePage({
  params,
  searchParams,
}: {
  params: Promise<{ handle: string }>;
  searchParams: Promise<{ tab?: string; type?: string }>;
}) {
  const [{ handle: rawHandle }, query] = await Promise.all([params, searchParams]);
  const handle = normalizeHandle(decodeURIComponent(rawHandle));
  if (!handle) notFound();
  let tab = parseTab(query.tab);
  const type = parseMediaFilter(query.type);

  const supabase = await createClient();
  const { data: claims } = await supabase.auth.getClaims();
  const me = claims?.claims?.sub;
  if (!me) redirect("/login");

  const { data: profileData, error: profileError } = await supabase
    .from("profiles")
    .select(PROFILE_COLUMNS)
    .eq("handle", handle)
    .maybeSingle();
  if (profileError) throw profileError;
  const profile = profileData as Profile | null;
  if (!profile) notFound();

  const state = await loadFriendsState(supabase, me);
  const relation = relationTo(state, profile.id);
  const friendship = state.friends.find((f) => f.profile.id === profile.id);
  const canView = relation === "self" || relation === "friend";
  const isFriend = relation === "friend";
  if (tab === "compare" && !isFriend) tab = "top";

  const renderHeader = (matchChip?: React.ReactNode) => (
    <div className="card-bold flex flex-col items-center gap-3 p-5 text-center">
      <ProfileAvatar profile={profile} size={80} />
      <div>
        <h1 className="display text-3xl leading-none">{profile.display_name || profile.handle}</h1>
        <p className="mt-1 text-[11px] font-bold uppercase tracking-wide text-ink-soft">
          @{profile.handle}
          {friendship &&
            ` · Friends since ${new Date(friendship.since).toLocaleDateString("en-GB", { month: "short", year: "numeric" })}`}
          {relation === "self" && " · This is you"}
        </p>
      </div>
      {matchChip}
    </div>
  );

  if (!canView) {
    const incoming = state.incoming.find((r) => r.profile.id === profile.id);
    return (
      <div className="mx-auto max-w-md px-4 py-6">
        <BackButton fallbackHref="/account/friends" />
        <div className="mt-4 flex flex-col gap-3">
          {renderHeader()}
          <div className="card-bold flex flex-col items-center gap-3 p-5 text-center">
            <p className="text-sm text-ink-soft">
              Become friends to see each other&apos;s ratings, library and lists.
            </p>
            <FriendshipButton
              userId={profile.id}
              relation={relation as "none" | "incoming" | "outgoing"}
              requestId={incoming?.id}
            />
          </div>
        </div>
      </div>
    );
  }

  const [libraryRes, listsRes, mineRes, myLibraryRes] = await Promise.all([
    supabase.rpc("friend_library", { target: profile.id }),
    tab === "lists" ? supabase.rpc("friend_lists", { target: profile.id }) : Promise.resolve({ data: [], error: null }),
    supabase.from("user_titles").select("title_id, status"),
    isFriend ? supabase.rpc("friend_library", { target: me }) : Promise.resolve({ data: [], error: null }),
  ]);
  if (myLibraryRes.error) throw myLibraryRes.error;
  if (libraryRes.error) throw libraryRes.error;
  if (listsRes.error) throw listsRes.error;
  if (mineRes.error) throw mineRes.error;

  const library = (libraryRes.data ?? []) as FriendLibraryRow[];
  const mine = new Map(
    ((mineRes.data ?? []) as { title_id: string; status: WatchStatus }[]).map((r) => [r.title_id, r.status]),
  );
  const counts = profileCounts(library);
  const filtered = filterByMedia(library, type);
  const myLibrary = (myLibraryRes.data ?? []) as FriendLibraryRow[];
  const overall = isFriend ? compareLibraries(myLibrary, library) : null;

  let body: React.ReactNode;
  if (tab === "top") {
    const rated = topRated(filtered).map(toCard);
    body = rated.length ? <Grid titles={rated} mine={mine} /> : <Empty>No ratings here yet.</Empty>;
  } else if (tab === "library") {
    const buckets = groupByStatus(filtered);
    body = (
      <div className="flex flex-col gap-5">
        {BUCKET_ORDER.filter((b) => b.status !== "watching" || type !== "movie").map((b) => (
          <section key={b.status}>
            <div className="mb-3 flex items-baseline gap-2">
              <h2 className="display text-xl">{b.label}</h2>
              <span className="stamp text-[10px]">{buckets[b.status].length}</span>
            </div>
            {buckets[b.status].length ? (
              <Grid titles={buckets[b.status].map(toCard)} mine={mine} muted={b.status === "dnf"} />
            ) : (
              <Empty>Nothing here yet.</Empty>
            )}
          </section>
        ))}
      </div>
    );
  } else if (tab === "compare") {
    const c = compareLibraries(filterByMedia(myLibrary, type), filtered);
    body = (
      <div className="flex flex-col gap-5">
        <div className="card-bold flex items-center justify-between gap-3 bg-acid p-4">
          <div>
            <p className="display text-4xl leading-none">
              {c.match.basis === "none" ? "—" : `${c.match.percent}%`}
            </p>
            <p className="mt-1 text-[10px] font-bold uppercase tracking-wide">{matchBasis(c.match)}</p>
          </div>
          <span className="stamp text-xs">Taste match</span>
        </div>
        {c.match.basis === "watching" && (
          <p className="-mt-3 text-xs text-ink-soft">
            Based on what you&apos;ve both watched, until you share 5 ratings.
          </p>
        )}
        <Section title="You agree" count={c.agree.length}>
          {c.agree.length ? <PairList pairs={c.agree} /> : <Empty>No close ratings yet.</Empty>}
        </Section>
        <Section title="You disagree" count={c.disagree.length}>
          {c.disagree.length ? <PairList pairs={c.disagree} /> : <Empty>No big disagreements.</Empty>}
        </Section>
        <Section title="They loved, you haven't seen" count={c.theyLoved.length}>
          {c.theyLoved.length ? <Grid titles={c.theyLoved} mine={mine} /> : <Empty>Nothing new to suggest.</Empty>}
        </Section>
        <Section title="You loved, they haven't seen" count={c.youLoved.length}>
          {c.youLoved.length ? <Grid titles={c.youLoved} mine={mine} /> : <Empty>Nothing to recommend them.</Empty>}
        </Section>
      </div>
    );
  } else {
    const lists = groupLists((listsRes.data ?? []) as FriendListRow[], type).filter(
      (l) => l.titles.length > 0 || type === "all",
    );
    body = lists.length ? (
      <div className="flex flex-col gap-5">
        {lists.map((list) => (
          <section key={list.id}>
            <div className="mb-3 flex items-baseline gap-2">
              <h2 className="display text-xl">{list.isFavorites ? "♥ Favorites" : list.name}</h2>
              <span className="stamp text-[10px]">{list.titles.length}</span>
            </div>
            {list.titles.length ? <Grid titles={list.titles} mine={mine} /> : <Empty>Empty list.</Empty>}
          </section>
        ))}
      </div>
    ) : (
      <Empty>No lists yet.</Empty>
    );
  }

  return (
    <div className="mx-auto max-w-md px-4 py-6">
      <BackButton fallbackHref="/account/friends" />
      <div className="mt-4 flex flex-col gap-3">
        {renderHeader(
          overall && (
            <Link
              href={hrefFor(profile.handle, "compare", type)}
              scroll={false}
              className="stamp text-xs"
              title={matchBasis(overall.match)}
            >
              {matchLabel(overall.match)}
            </Link>
          ),
        )}
        <div className="grid grid-cols-3 gap-2 text-center">
          {[
            { label: "Completed", value: counts.completed },
            { label: "Watching", value: counts.watching },
            { label: "Rated", value: counts.rated },
          ].map((s) => (
            <div key={s.label} className="card-bold px-2 py-3">
              <p className="display text-2xl leading-none">{s.value}</p>
              <p className="mt-1 text-[9px] font-bold uppercase tracking-wide text-ink-soft">{s.label}</p>
            </div>
          ))}
        </div>

        <nav className="hard-shadow-sm mt-2 flex overflow-hidden rounded-[10px] border-[3px] border-ink">
          {PROFILE_TABS.filter((t) => t.value !== "compare" || isFriend).map((t) => (
            <Link
              key={t.value}
              href={hrefFor(profile.handle, t.value, type)}
              scroll={false}
              className={`flex-1 border-r-[3px] border-ink py-2 text-center text-[11px] font-bold uppercase tracking-wide last:border-r-0 ${
                tab === t.value ? "bg-acid text-ink" : "bg-paper text-ink-soft"
              }`}
            >
              {t.label}
            </Link>
          ))}
        </nav>

        <div className="flex gap-1.5">
          {MEDIA_FILTERS.map((f) => (
            <Link
              key={f.value}
              href={hrefFor(profile.handle, tab, f.value)}
              scroll={false}
              className={`border-2 border-ink px-2.5 py-1 text-[10px] font-bold uppercase tracking-wide ${
                type === f.value ? "bg-ink text-paper" : "bg-paper text-ink"
              }`}
            >
              {f.label}
            </Link>
          ))}
        </div>

        <div className="mt-1">{body}</div>
      </div>
    </div>
  );
}
