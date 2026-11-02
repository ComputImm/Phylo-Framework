"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import Overlay from "@/components/common/Overlay";
import { DRAWER_SITE_LINKS } from "@/components/layout/siteNavigation";

export default function MobileNavDrawer({ open, onClose }: { open: boolean; onClose: () => void }) {
  const pathname = usePathname();

  return (
    <Overlay open={open} onClose={onClose} title="Menu" side="left" className="rounded-none border-y-0 border-l-0">
      <nav aria-label="Site" className="flex flex-col gap-1">
        {DRAWER_SITE_LINKS.map(({ href, label }) => {
          const isActive = pathname === href;
          return (
            <Link
              key={href}
              href={href}
              onClick={onClose}
              aria-current={isActive ? "page" : undefined}
              className={cn(
                "flex min-h-11 items-center rounded-lg px-3 text-sm font-medium transition-colors",
                isActive ? "bg-primary/12 text-primary" : "text-foreground hover:bg-accent",
              )}
            >
              {label}
            </Link>
          );
        })}
      </nav>
    </Overlay>
  );
}
