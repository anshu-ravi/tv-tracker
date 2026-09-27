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

## Closed, don't reopen without a new reason

- **Avatar icon picker.** A bundled-SVG picker replacing photo upload was built and rejected on sight. Photo upload stays.
- **Solo Leveling shows "Ended".** TMDB itself lists it as ended with one 25-episode season. Our data matches.
- **Missing filler tags for Fire Force S3, Dan Da Dan and Bleach TYBW past episode 40.** animefillerlist hasn't published them. These show the quiet dash on purpose.
- **The `food-wars-fourth-plate` slug serving "Bleach OVAs"** is animefillerlist's own stale URL. A regression test pins it so nobody "fixes" it.

## Working with subagents

An old version of `CLAUDE.md` said Claude never writes implementation itself. Subagents read that too, identified as Claude, and delegated onward: twice in one session, about 120k tokens, while reporting work "underway" on an empty working tree. Run `git status` before believing any agent's report of finished work.
