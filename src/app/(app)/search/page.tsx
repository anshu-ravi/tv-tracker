import { redirect } from "next/navigation";

// The Search tab was renamed to Explore (same route group, /explore) — this
// stub keeps old bookmarks/links working.
export default function SearchPage() {
  redirect("/explore");
}
