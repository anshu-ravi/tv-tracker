// Inline SVG icons only (no icon libraries — a strict CSP blocks external
// anything). Thick strokes, no fill unless "active", so they read as
// neo-brutalist rather than default web-app icons. Shared between
// TitleActionBar (detail/preview pages) and CardActionSheet (poster grids).

export function TagIcon({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2.5}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
    >
      <path d="M20.5 12.5 12.5 20.5a2 2 0 0 1-2.83 0L3.5 14.33a2 2 0 0 1 0-2.83L11.5 3.5H19a1.5 1.5 0 0 1 1.5 1.5z" />
      <circle cx="15" cy="9" r="1.1" fill="currentColor" stroke="none" />
    </svg>
  );
}

export function BookmarkPlusIcon({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2.5}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
    >
      <path d="M6 3.5h12a1 1 0 0 1 1 1V21l-7-4.5L5 21V4.5a1 1 0 0 1 1-1z" />
      <path d="M9.5 8.5h5M12 6v5" />
    </svg>
  );
}

export function HeartIcon({ className, filled }: { className?: string; filled?: boolean }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill={filled ? "currentColor" : "none"}
      stroke="currentColor"
      strokeWidth={2.5}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
    >
      <path d="M12 20.5s-7.5-4.6-10-9.2C.4 8 1.7 4 5.3 3.2c2.4-.5 4.6.6 6.7 3 2.1-2.4 4.3-3.5 6.7-3 3.6.8 4.9 4.8 3.3 8.1-2.5 4.6-10 9.2-10 9.2z" />
    </svg>
  );
}

export function CheckIcon({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={3}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
    >
      <path d="M4 12.5 9.5 18 20 5" />
    </svg>
  );
}
