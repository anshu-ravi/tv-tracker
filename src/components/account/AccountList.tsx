import Link from "next/link";
import { ChevronRightIcon } from "@/components/icons";

// A labelled block of rows separated by 2px rules.
export function AccountGroup({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <section className="mt-6">
      <h2 className="mb-2 text-[11px] font-bold uppercase tracking-wide text-ink-soft">{label}</h2>
      <div className="divide-y-2 divide-ink border-2 border-ink bg-paper">{children}</div>
    </section>
  );
}

export function RowBody({
  icon,
  title,
  subtitle,
  badge,
  trailing,
}: {
  icon: React.ReactNode;
  title: string;
  subtitle?: React.ReactNode;
  badge?: number;
  trailing?: React.ReactNode;
}) {
  return (
    <>
      <span className="flex h-5 w-5 shrink-0 items-center justify-center">{icon}</span>
      <span className="min-w-0 flex-1">
        <span className="block text-sm font-bold">{title}</span>
        {subtitle && <span className="block truncate text-[11px] text-ink-soft">{subtitle}</span>}
      </span>
      {!!badge && <span className="shrink-0 border-2 border-ink bg-acid px-1.5 text-xs font-bold">{badge}</span>}
      {trailing ?? <ChevronRightIcon className="h-4 w-4 shrink-0" />}
    </>
  );
}

export const rowClass = "flex w-full items-center gap-3 px-3 py-3 text-left active:bg-panel";

export function AccountRow({ href, ...body }: { href: string } & React.ComponentProps<typeof RowBody>) {
  return (
    <Link href={href} className={rowClass}>
      <RowBody {...body} />
    </Link>
  );
}
