"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import { DASHBOARD_NAV_ITEMS, isDashboardNavActive } from "@/components/dashboard/navigation";

/** Phone navigation for the dashboard; the Sidebar takes over from `md` up. */
export default function DashboardTabBar() {
  const pathname = usePathname();

  return (
    <nav
      aria-label="Workspace"
      className="flex shrink-0 border-t bg-sidebar pb-[env(safe-area-inset-bottom)] md:hidden"
    >
      {DASHBOARD_NAV_ITEMS.map(({ href, label, shortLabel, icon: Icon }) => {
        const isActive = isDashboardNavActive(href, pathname);
        return (
          <Link
            key={href}
            href={href}
            aria-label={label}
            aria-current={isActive ? "page" : undefined}
            className={cn(
              "flex min-h-14 min-w-0 flex-1 flex-col items-center justify-center gap-1 text-[11px] font-medium transition-colors",
              isActive ? "text-primary" : "text-muted-foreground",
            )}
          >
            <Icon className="size-5" />
            <span className="truncate">{shortLabel}</span>
          </Link>
        );
      })}
    </nav>
  );
}
