// Date labels and grouping for the Home Upcoming tab.

export const SOON_DAYS = 7;
const FAR_DAYS = 180;

function fmt(iso: string, options: Intl.DateTimeFormatOptions): string {
  return new Date(`${iso}T00:00:00Z`).toLocaleDateString("en-GB", { timeZone: "UTC", ...options });
}

/** Right-hand date for an Upcoming row: a primary line and an optional muted second line. */
export function upcomingDateLabel(airDate: string, daysUntil: number): { primary: string; secondary: string | null } {
  if (daysUntil <= 0) return { primary: "Today", secondary: null };
  if (daysUntil === 1) return { primary: "Tomorrow", secondary: null };
  if (daysUntil < SOON_DAYS) {
    return { primary: fmt(airDate, { weekday: "short" }), secondary: fmt(airDate, { day: "numeric", month: "short" }) };
  }
  const primary =
    daysUntil > FAR_DAYS ? fmt(airDate, { month: "short", year: "numeric" }) : fmt(airDate, { day: "numeric", month: "short" });
  return { primary, secondary: `in ${daysUntil} days` };
}

/** Normalises stored labels like "S1 E57" to the app-wide "S1E57". */
export function compactEpisodeCode(label: string): string {
  return label.replace(/\bS(\d+)\s+E(\d+)/, "S$1E$2");
}
