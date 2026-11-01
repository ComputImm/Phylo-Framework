"use client";

import { useEffect, useState } from "react";
import { ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";

export type LegalTocItem = { id: string; title: string };

export function LegalToc({ items }: { items: LegalTocItem[] }) {
  const [activeId, setActiveId] = useState(items[0]?.id);

  // Follows the reading position. The page scrolls inside the site layout, not
  // the window, hence the capturing listener. The last section may be too short
  // to ever reach the top, so it becomes active once it is fully in view.
  useEffect(() => {
    const sections = items.flatMap(({ id }) => document.getElementById(id) ?? []);
    const update = () => {
      const last = sections[sections.length - 1];
      if (!last) return;
      const current =
        last.getBoundingClientRect().bottom <= window.innerHeight
          ? last
          : sections.filter((s) => s.getBoundingClientRect().top <= window.innerHeight * 0.3).pop();
      setActiveId(current?.id ?? items[0]?.id);
    };
    update();
    document.addEventListener("scroll", update, { capture: true, passive: true });
    return () => document.removeEventListener("scroll", update, { capture: true });
  }, [items]);

  return (
    <>
      <details className="group rounded-xl border bg-card lg:hidden">
        <summary className="flex list-none items-center justify-between px-4 py-3 text-sm font-medium [&::-webkit-details-marker]:hidden">
          On this page
          <ChevronDown className="h-4 w-4 text-muted-foreground transition-transform group-open:rotate-180" />
        </summary>
        <ol className="space-y-1 border-t px-4 py-3 text-sm">
          {items.map((item, index) => (
            <li key={item.id}>
              <a
                href={`#${item.id}`}
                className="flex gap-2 py-1 text-muted-foreground hover:text-foreground"
              >
                <span className="w-5 shrink-0 tabular-nums">{index + 1}</span>
                {item.title}
              </a>
            </li>
          ))}
        </ol>
      </details>

      <nav aria-label="On this page" className="hidden lg:block">
        <p className="mb-3 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          On this page
        </p>
        <ol className="space-y-0.5 border-l text-sm">
          {items.map((item) => (
            <li key={item.id}>
              <a
                href={`#${item.id}`}
                aria-current={activeId === item.id ? "location" : undefined}
                className={cn(
                  "-ml-px block border-l-2 py-1.5 pl-3 transition-colors",
                  activeId === item.id
                    ? "border-primary font-medium text-foreground"
                    : "border-transparent text-muted-foreground hover:text-foreground",
                )}
              >
                {item.title}
              </a>
            </li>
          ))}
        </ol>
      </nav>
    </>
  );
}
