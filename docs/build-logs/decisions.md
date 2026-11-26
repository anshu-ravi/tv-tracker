# Decisions and dead ends

Things that were tried, measured or ruled out, kept here so nobody retries them blind.

## Performance

- **Latency was geography, not the database.** Vercel functions ran in `iad1` (Washington DC) while Supabase is in eu-west-1, so every query paid a transatlantic round trip (270-340ms TTFB on a page with one auth call). `vercel.json` pins functions to `dub1`. The full stats join over ~6,600 watched rows runs in about 10ms.
- **Round trips were the real cost.** Home, stats, favorites and the recommendations refresh each collapsed into a single `SECURITY INVOKER` RPC. Keep them invoker: switching to definer would leak one account's history into another's.
- **A service worker was built and removed.** It only cached content-hashed build assets that already carry immutable cache headers, and WebKit exempts the HTTP cache from the eviction policy Cache Storage is subject to. It added update complexity for no gain.
- **`cacheComponents: true` doesn't fit this app.** Every page reads cookies through `createClient()` before rendering, so the build fails with "Uncached data was accessed outside of `<Suspense>`". All content is per-user RLS data, so a static shell could only hold chrome that's already static.
- **Don't precompute stats.** The query is about 10% of the page budget. Postgres has no RLS on materialized views, so a safe version needs a real table kept fresh by triggers (which slow the mark-watched path) or cron (stale when you look). Revisit only if watch history reaches six figures.
- `prefetch={true}` moves a route into the `static` staleTimes bucket, not `dynamic`. 30s is the lowest `static` value Next allows.

## Recommendations

- **TMDB's `/recommendations` order isn't ranked by quality.** For Brooklyn Nine-Nine, page 1 leads with Barney Miller and The Honeymooners while Friends sits at position 16. The app pulls three pages and re-ranks by `log10(vote_count+1) * vote_average + log10(popularity+1) * 3`, with a vote-count floor that steps 150 → 50 → 0 so an obscure seed gives a short rail instead of an empty one.
- `/similar` drifts off-genre (Bleach returns Doctor Who and Star Trek), so it's a last resort, and non-anime results are dropped when the seed is anime.
- Some obvious neighbours (Modern Family for Brooklyn Nine-Nine) aren't in TMDB's recommendation graph at all. Surfacing them needs a genre or keyword `/discover` query, not better ranking.

## The nightly refresh

- The first version of `refresh-air-dates` was written but never deployed, which was lucky: it would have routed anime back to AniList, nulled every `absolute_number` (breaking filler tags) and refreshed only one season per show. Keep `mediaTypeGuard.ts` trivial and tested for the same reason.
- Edge Function secrets (`supabase secrets set`) and the service-role key in Vault are separate stores from the app's `.env` files. Setting one doesn't set the other.
- A failed animefillerlist fetch must leave existing filler data alone. Writing `filler_available = false` after a network hiccup would wipe tags until the next good run.

## Friends

- **Friends read each other's data only through security-definer RPCs, never through RLS.** Almost every existing query (Home, Library, stats, the Home/stats RPCs, the recommendations pipeline) relies on RLS to return only the caller's rows, with only about a dozen explicit `user_id` filters. A "friends can select" policy on `user_titles` or `watched_episodes` would silently merge a friend's library into all of those. Tracking tables stay owner-only; friend-facing functions check the friendship and return a whitelist of fields. This is a deliberate exception to the "keep RPCs security invoker" rule, which still holds for the caller's own Home/stats RPCs.
- **The friend code lives in its own owner-only table, not on `profiles`.** Profiles are readable by every signed-in account (search, profile headers), and the code is effectively a key: redeeming it creates a friendship with no accept step.
- **Opening an invite link shows a one-tap "Add friend" rather than adding on load.** Chat apps fetch links to build previews and Next prefetches routes; neither should be able to create a friendship.
- **Handles are generated from the display name, never the email**, so a new account's handle doesn't leak its email address.
- **`supabase db push` is unsafe here.** About a dozen migrations are recorded remotely under different versions from their local files, so a push treats old files as unapplied. Apply a single file with `supabase db query --linked -f <file>` and record it with `supabase migration repair --status applied <version>`, or use the MCP `apply_migration` tool.

## Fresh-token 401s

- **The server Supabase client retries a request once, after 1s, when PostgREST answers 401 `PGRST303`.** After more than an hour idle, the proxy refreshes the session and the page's first queries use a JWT minted a second earlier; PostgREST occasionally rejects such a token (`PGRST303`, claims validation, likely clock skew against Auth), while the same token is accepted milliseconds later. Seen on 2026-11-26 at 10:09 and 11:14 UTC, once on `get_home_payload` (Home error screen) and once on the friend-request badge. Only `PGRST303` is retried, so a genuinely expired or invalid token still fails. The wrapper is `src/lib/supabase/retryFetch.ts`.
- **Error boundaries use `unstable_retry()`, not `reset()`.** `reset()` re-renders from the RSC payload already on the client, so a server-side error re-throws immediately and Try Again looks dead; `unstable_retry()` re-fetches the segment first.

## Title page declutter

The title header had about ten equal-weight bordered controls, an always-open rating slider that outweighed everything else, and acid green on three unrelated things, so nothing read as primary. The redesign keeps every function but ranks them: status is the one labelled acid button (icon per state, "Caught up" vs "Completed" from `is_running`), list/favorite are quiet icons, and rare fix-ups (refresh, TV/Anime correction, remove) moved into a `⋯` menu. External scores, where-to-watch and the owner's rating share one 2px strip; the rating slider lives in a bottom sheet that saves as you drag, so dismissing it never loses a value. The poster overlaps the backdrop to tie the duplicated art together. An Up next card brings the most common action (mark next episode) above the fold; it shares watched state with the episode list through `WatchedEpisodesProvider` so the two never disagree. Friends collapsed to one line with the list in a sheet. The overview is deliberately not clamped — the owner wants it shown in full.

## Account page declutter

Same treatment as the title page: ten identical heavy cards, an always-open profile form, and the email shown three times made the page feel like a settings dump with the interesting part (stats) last. Now a profile header with an Edit sheet (photo, name, handle), an acid stats strip loaded behind Suspense (it runs the same `get_user_stats` RPC as the Stats page), a resolve banner only when titles are pending, and two 2px groups (You, Settings) whose rows carry live subtitles. Refresh shows only the latest cron run of either scope; the daily/weekly split was dropped as rarely useful.

## Streaming page declutter

The 108-logo grid buried a handful of picks and its brand colours fought the acid selection. It is now a list: picked services first (remove with ×), then a searchable add list showing TMDB's top 12 for the country with "Show all". Names ending in "Channel" (Amazon/Apple add-on bundles, about 40% of Spain's list) only appear in search. Every tap autosaves through a serialised queue that sends only the newest state and rolls back on failure, matching the instant toggles elsewhere in the app.

## Stats page declutter

Eleven heavy cards for a read-only page, acid on every bar, and the same fact told three times (Days tile, "days of your life" fact, Hours ÷ 24). Now one 2px hero strip with Hours as the single acid fact (days as its sub-label), then 2px groups: where your time went, library, ratings, history. Top Shows by time and "Longest series conquered" were removed rather than restyled: both rank by episode count, so long-runners always win and the list says little about taste. The media split moved from episodes to hours for the same reason (each movie counted as one episode), with three distinct fills (ink, acid, grey) and a minimum segment width so a small share stays visible. By Year sits in a bottom sheet behind one row because the bulk import makes it one spike; the Top 10 carousel became a Top rated row linking to `/account/ratings`, which already shows the full ranking.

## Home declutter

Every Up Next show and every Upcoming title was a heavy 3px card with a shadow, and acid sat on the active tab, both section stamps, every tick, canon tags, media-type stamps and "Airs tomorrow" pills, so nothing ranked. Up Next cards keep the 3px border and shadow (the owner liked them; a 2px version was tried and reverted) with a bigger poster (76px wide) and lead with the episode name; the show is a small label above it, because Home is where you come back for the next episode, not the show. Every tick stays acid on purpose (owner decision: each card is its own zone). The inline ▾ overview became a bottom sheet with the full overview, a Mark watched button and an Open title row. The per-card toast became one page toast above the nav, 4s as the design language says (it was 2.5s); the refresh that brings in the next episode waits for it. Upcoming is split into Next 7 days (a rolling window from today, renamed from "This week", which read as the calendar week), a horizontal poster carousel with the date stamped on the art (a two-column grid was built first and swapped for the carousel at the owner's request), and Later, a compact 2px list with a real date on the right; big art helps recognise what is coming soon, while far-off titles are mostly a date lookup. Bigger list rows, a full grid and per-day rails were mocked and passed over. Dates are real ones, since "in 224 days" alone was unreadable. Acid marks every title airing today or tomorrow; marking only the first row was tried and dropped, because rows airing the same day have no ranking between them. Catch up was kept as is at the owner's request. The episode-still card variant was considered and passed over: it was the most visual but fits only two or three shows per screen, and would have needed `still_url` added to `get_home_payload`.

## Closed, don't reopen without a new reason

- **Avatar icon picker.** A bundled-SVG picker replacing photo upload was built and rejected on sight. Photo upload stays.
- **Solo Leveling shows "Ended".** TMDB itself lists it as ended with one 25-episode season. Our data matches.
- **Missing filler tags for Fire Force S3, Dan Da Dan and Bleach TYBW past episode 40.** animefillerlist hasn't published them. These show the quiet dash on purpose.
- **The `food-wars-fourth-plate` slug serving "Bleach OVAs"** is animefillerlist's own stale URL. A regression test pins it so nobody "fixes" it.

## Working with subagents

An old version of `CLAUDE.md` said Claude never writes implementation itself. Subagents read that too, identified as Claude, and delegated onward: twice in one session, about 120k tokens, while reporting work "underway" on an empty working tree. Run `git status` before believing any agent's report of finished work.
