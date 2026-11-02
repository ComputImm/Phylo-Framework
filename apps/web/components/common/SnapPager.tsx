"use client";

import { Children, useEffect, useRef, useState, type CSSProperties, type ReactNode } from "react";
import { cn } from "@/lib/utils";

/**
 * Below `md`, shows its children one at a time: swipe between them or use the chips.
 * From `md` up it steps aside, so `className` alone decides how the children sit
 * (a grid, a row). Every page stays mounted and laid out on both, so trees keep their
 * state and can respond to a Sequence Trace focus while off-screen.
 */
export default function SnapPager({
  labels,
  initialIndex = 0,
  className,
  style,
  children,
}: {
  /** One chip label per child. */
  labels: string[];
  initialIndex?: number;
  className?: string;
  style?: CSSProperties;
  children: ReactNode;
}) {
  const pages = Children.toArray(children);
  const scrollerRef = useRef<HTMLDivElement>(null);
  const [activeIndex, setActiveIndex] = useState(initialIndex);

  const showPage = (index: number, behavior: ScrollBehavior) => {
    const scroller = scrollerRef.current;
    const page = scroller?.children[index];
    if (scroller && page instanceof HTMLElement) {
      scroller.scrollTo({ left: page.offsetLeft - scroller.offsetLeft, behavior });
    }
  };

  useEffect(() => {
    showPage(initialIndex, "auto");
  }, [initialIndex]);

  useEffect(() => {
    const scroller = scrollerRef.current;
    if (!scroller) return;
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) setActiveIndex([...scroller.children].indexOf(entry.target));
        }
      },
      { root: scroller, threshold: 0.6 },
    );
    [...scroller.children].forEach((page) => observer.observe(page));
    return () => observer.disconnect();
  }, [pages.length]);

  return (
    <div>
      {pages.length > 1 && (
        <div className="mb-3 flex gap-1.5 overflow-x-auto md:hidden">
          {labels.map((label, index) => (
            <button
              key={label}
              type="button"
              onClick={() => showPage(index, "smooth")}
              aria-current={index === activeIndex ? "true" : undefined}
              className={cn(
                "min-h-9 shrink-0 rounded-full border px-3.5 text-sm font-medium transition-colors pointer-coarse:min-h-11",
                index === activeIndex ? "border-primary bg-primary text-primary-foreground" : "text-muted-foreground",
              )}
            >
              {label}
            </button>
          ))}
        </div>
      )}
      <div
        ref={scrollerRef}
        style={style}
        className={cn(
          "max-md:relative max-md:flex max-md:snap-x max-md:snap-mandatory max-md:items-start max-md:gap-4 max-md:overflow-x-auto max-md:[scrollbar-width:none]",
          className,
        )}
      >
        {pages.map((page, index) => (
          <div key={index} className="max-md:w-full max-md:shrink-0 max-md:snap-start md:contents">
            {page}
          </div>
        ))}
      </div>
    </div>
  );
}
