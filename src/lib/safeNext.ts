/** Returns `raw` if it is a same-origin path, else "/". Guards the post-login redirect. */
export function safeNext(raw: unknown): string {
  if (typeof raw !== "string" || !raw.startsWith("/")) return "/";
  if (raw.startsWith("//") || raw.startsWith("/\\")) return "/";
  if (raw.startsWith("/login") || raw.startsWith("/auth")) return "/";
  return raw;
}
