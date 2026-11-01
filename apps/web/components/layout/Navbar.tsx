"use client";

import Link from "next/link";
import { useTheme } from "next-themes";
import { Menu, Moon, Sun } from "lucide-react";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import MobileNavDrawer from "@/components/layout/MobileNavDrawer";
import { PRIMARY_SITE_LINKS } from "@/components/layout/siteNavigation";
import { UserAvatarMenu } from "@/components/layout/UserAvatarMenu";

export default function Navbar() {
  const { theme, setTheme, resolvedTheme } = useTheme();
  const [mounted, setMounted] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  const isDark = mounted && (resolvedTheme ?? theme) === "dark";

  return (
    <>
    <header className="sticky top-0 z-50 w-full shrink-0 border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
      <div className="flex h-(--navbar-height) items-center justify-between gap-2 px-3 sm:px-4 md:px-6 min-w-0 w-full">
        <div className="flex items-center gap-2 sm:gap-4 min-w-0 flex-1">
          <Button
            variant="ghost"
            size="icon"
            onClick={() => setMenuOpen(true)}
            aria-label="Open menu"
            aria-expanded={menuOpen}
            className="-ml-1.5 sm:hidden"
          >
            <Menu className="h-5 w-5" />
          </Button>
          <Link
            href="/"
            className="text-base font-semibold text-foreground hover:text-primary transition-colors sm:text-lg truncate shrink-0"
          >
            Phylo Framework
          </Link>
          <nav className="hidden sm:flex items-center gap-2 sm:gap-4 shrink-0">
            {PRIMARY_SITE_LINKS.map(({ href, label }) => (
              <Link
                key={href}
                href={href}
                className="text-sm font-medium text-muted-foreground hover:text-foreground transition-colors whitespace-nowrap"
              >
                {label}
              </Link>
            ))}
          </nav>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          <Button
            variant="ghost"
            size="icon"
            onClick={() => setTheme(isDark ? "light" : "dark")}
            aria-label="Toggle theme"
            className="cursor-pointer rounded-full"
          >
            {mounted ? (
              isDark ? (
                <Moon className="h-5 w-5" />
              ) : (
                <Sun className="h-5 w-5" />
              )
            ) : (
              <span className="h-5 w-5" />
            )}
          </Button>
          <UserAvatarMenu />
        </div>
      </div>
    </header>
    {/* Outside the header: its backdrop-filter would confine a fixed overlay to it. */}
    <MobileNavDrawer open={menuOpen} onClose={() => setMenuOpen(false)} />
    </>
  );
}
