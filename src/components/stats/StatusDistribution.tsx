import type { UserStats } from "@/lib/stats";
import { AccountGroup } from "@/components/account/AccountList";
import { StripCell } from "@/components/RatingsStrip";

// Tracked-title counts per status bucket, with completion rate in the label.
export default function StatusDistribution({ stats }: { stats: UserStats }) {
  const { completed, watching, watchlist, dnf } = stats.statusCounts;
  const cells = [
    { label: "Done", value: completed },
    { label: "Watching", value: watching },
    { label: "Watchlist", value: watchlist },
  ];

  return (
    <AccountGroup label={`Library · ${stats.completionRate}% finished`}>
      <div className="flex divide-x-2 divide-ink">
        {cells.map((c) => (
          <StripCell key={c.label} label={c.label}>
            {c.value.toLocaleString()}
          </StripCell>
        ))}
        <StripCell label="DNF">
          <span className="text-ink-soft">{dnf.toLocaleString()}</span>
        </StripCell>
      </div>
    </AccountGroup>
  );
}
