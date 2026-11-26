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

export function RefreshIcon({ className }: { className?: string }) {
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
      <path d="M4 12a8 8 0 0 1 13.66-5.66L20 8.5" />
      <path d="M20 4v4.5h-4.5" />
      <path d="M20 12a8 8 0 0 1-13.66 5.66L4 15.5" />
      <path d="M4 20v-4.5h4.5" />
    </svg>
  );
}

// Bottom-nav icons (Home / Library / Search / Account).

export function HomeIcon({ className }: { className?: string }) {
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
      <path d="M4 11.5 12 4l8 7.5" />
      <path d="M6 10v9.5a1 1 0 0 0 1 1h10a1 1 0 0 0 1-1V10" />
      <path d="M10 20.5V14h4v6.5" />
    </svg>
  );
}

export function LibraryIcon({ className }: { className?: string }) {
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
      <rect x="3.5" y="4" width="7" height="16" rx="0.5" />
      <rect x="13.5" y="4" width="7" height="16" rx="0.5" />
      <path d="M3.5 9h7M13.5 9h7" />
    </svg>
  );
}

export function SearchIcon({ className }: { className?: string }) {
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
      <circle cx="10.5" cy="10.5" r="6.5" />
      <path d="m20 20-4.8-4.8" />
    </svg>
  );
}

export function UserIcon({ className }: { className?: string }) {
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
      <circle cx="12" cy="8" r="3.75" />
      <path d="M4.5 20c1.2-4 4.2-6 7.5-6s6.3 2 7.5 6" />
    </svg>
  );
}

// Status, list and overflow icons for the title page action row.

function StrokeIcon({ className, children }: { className?: string; children: React.ReactNode }) {
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
      {children}
    </svg>
  );
}

export function PlusIcon({ className }: { className?: string }) {
  return (
    <StrokeIcon className={className}>
      <path d="M12 5v14M5 12h14" />
    </StrokeIcon>
  );
}

export function ClockIcon({ className }: { className?: string }) {
  return (
    <StrokeIcon className={className}>
      <circle cx="12" cy="12" r="8.5" />
      <path d="M12 7.5V12l3 2" />
    </StrokeIcon>
  );
}

export function PlayIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" className={className}>
      <path d="M7 4.5v15a.8.8 0 0 0 1.2.7l12-7.5a.8.8 0 0 0 0-1.4l-12-7.5A.8.8 0 0 0 7 4.5z" />
    </svg>
  );
}

export function BanIcon({ className }: { className?: string }) {
  return (
    <StrokeIcon className={className}>
      <circle cx="12" cy="12" r="8.5" />
      <path d="m6 6 12 12" />
    </StrokeIcon>
  );
}

export function ListPlusIcon({ className }: { className?: string }) {
  return (
    <StrokeIcon className={className}>
      <path d="M4 6h12M4 11h12M4 16h7" />
      <path d="M18 14v6M15 17h6" />
    </StrokeIcon>
  );
}

export function DotsIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" className={className}>
      <circle cx="5" cy="12" r="2.2" />
      <circle cx="12" cy="12" r="2.2" />
      <circle cx="19" cy="12" r="2.2" />
    </svg>
  );
}

export function ChevronDownIcon({ className }: { className?: string }) {
  return (
    <StrokeIcon className={className}>
      <path d="m6 9 6 6 6-6" />
    </StrokeIcon>
  );
}

export function ChevronRightIcon({ className }: { className?: string }) {
  return (
    <StrokeIcon className={className}>
      <path d="m9 6 6 6-6 6" />
    </StrokeIcon>
  );
}

// Account page row icons.

export function StarIcon({ className }: { className?: string }) {
  return (
    <StrokeIcon className={className}>
      <path d="m12 3.5 2.6 5.3 5.9.9-4.3 4.1 1 5.8-5.2-2.7-5.2 2.7 1-5.8-4.3-4.1 5.9-.9z" />
    </StrokeIcon>
  );
}

export function CardsIcon({ className }: { className?: string }) {
  return (
    <StrokeIcon className={className}>
      <rect x="6" y="7" width="13" height="13" rx="1" />
      <path d="M4 16V5a1 1 0 0 1 1-1h11" />
    </StrokeIcon>
  );
}

export function UsersIcon({ className }: { className?: string }) {
  return (
    <StrokeIcon className={className}>
      <circle cx="9" cy="8.5" r="3.25" />
      <path d="M3 19.5c.9-3.3 3.2-5 6-5s5.1 1.7 6 5" />
      <path d="M16 5.5a3 3 0 0 1 0 6M18.5 14.8c1.3.8 2.1 2.4 2.5 4.7" />
    </StrokeIcon>
  );
}

export function TvIcon({ className }: { className?: string }) {
  return (
    <StrokeIcon className={className}>
      <rect x="3" y="6.5" width="18" height="12.5" rx="1" />
      <path d="m8.5 3 3.5 3.5L15.5 3" />
    </StrokeIcon>
  );
}

export function CameraIcon({ className }: { className?: string }) {
  return (
    <StrokeIcon className={className}>
      <path d="M4 8h3l1.5-2.5h7L17 8h3v11H4z" />
      <circle cx="12" cy="13" r="3.25" />
    </StrokeIcon>
  );
}

export function LogOutIcon({ className }: { className?: string }) {
  return (
    <StrokeIcon className={className}>
      <path d="M10 4H5v16h5" />
      <path d="M14 8l4 4-4 4M18 12H9" />
    </StrokeIcon>
  );
}
