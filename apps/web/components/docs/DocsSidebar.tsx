"use client";

import { useEffect, useRef } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { BookOpen, Database, GitBranch, Network, PlayCircle, Table2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { METHOD_IDS } from "@/features/docs/types";
import { getMethodContent } from "@/features/docs/content";

type Item = { href: string; label: string; icon: typeof BookOpen };

const ITEMS: Item[] = [
  { href: "/documents", label: "Overview", icon: BookOpen },
  { href: "/documents/architecture", label: "Architecture", icon: Network },
  { href: "/documents/data-model", label: "Data model", icon: Database },
  { href: "/documents/data-requirements", label: "Data requirements", icon: Table2 },
  { href: "/documents/try-it-yourself", label: "Try it yourself", icon: PlayCircle },
  ...METHOD_IDS.map((id) => ({
    href: `/documents/${id}`,
    label: getMethodContent(id).displayName,
    icon: GitBranch,
  })),
];

export default function DocsSidebar() {
  const pathname = usePathname();
  const activeRef = useRef<HTMLAnchorElement>(null);

  // On phones the items are a sideways strip, so a deep link can land off-screen.
  useEffect(() => {
    activeRef.current?.scrollIntoView({ block: "nearest", inline: "center" });
  }, [pathname]);

  return (
    <aside className="shrink-0 border-b bg-muted/30 md:h-full md:w-60 md:border-b-0 md:border-r">
      <div className="hidden px-4 pt-5 pb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground md:block">
        Documentation
      </div>
      <nav className="flex gap-1 overflow-x-auto p-2 md:flex-col md:overflow-visible">
        {ITEMS.map(({ href, label, icon: Icon }) => {
          const isActive = href === "/documents" ? pathname === "/documents" : pathname === href;
          return (
            <Link
              key={href}
              href={href}
              ref={isActive ? activeRef : undefined}
              aria-current={isActive ? "page" : undefined}
              className={cn(
                "flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium whitespace-nowrap transition-colors",
                isActive
                  ? "bg-primary text-primary-foreground"
                  : "text-muted-foreground hover:bg-muted hover:text-foreground",
              )}
            >
              <Icon className="h-4 w-4 shrink-0" />
              <span>{label}</span>
            </Link>
          );
        })}
      </nav>
    </aside>
  );
}
