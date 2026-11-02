"use client";

import { useState, type ReactNode } from "react";
import { ChevronDown } from "lucide-react";
import { BELOW_MD, useMediaQuery } from "@/lib/hooks/useMediaQuery";
import { cn } from "@/lib/utils";

/**
 * A bordered block of form fields. On phones its header collapses it, because the
 * longest method forms run to about 60 fields. Fields stay mounted while collapsed,
 * so they keep their values and validation.
 */
export default function FormSection({
  title,
  trailing,
  defaultOpen = false,
  forceOpen = false,
  className,
  headerClassName,
  children,
}: {
  title: ReactNode;
  /** Shown at the far end of the header. */
  trailing?: ReactNode;
  defaultOpen?: boolean;
  /** Opens regardless of the user's choice, for example to reveal a validation error. */
  forceOpen?: boolean;
  className?: string;
  headerClassName?: string;
  children: ReactNode;
}) {
  const isPhone = useMediaQuery(BELOW_MD);
  const [userOpen, setUserOpen] = useState(defaultOpen);
  const open = !isPhone || forceOpen || userOpen;

  return (
    <section className={cn("col-span-full border bg-card/30", className)}>
      {isPhone ? (
        <button
          type="button"
          onClick={() => setUserOpen(!open)}
          aria-expanded={open}
          className={cn("flex min-h-11 w-full items-center justify-between gap-2 text-left", open && "border-b", headerClassName)}
        >
          {title}
          <span className="flex shrink-0 items-center gap-2">
            {trailing}
            <ChevronDown className={cn("size-4 text-muted-foreground transition-transform", open && "rotate-180")} />
          </span>
        </button>
      ) : (
        <div className={cn("flex items-center justify-between border-b", headerClassName)}>
          {title}
          {trailing}
        </div>
      )}
      <div className={cn("grid-cols-1 gap-4 p-4 md:grid-cols-2 xl:grid-cols-3", open ? "grid" : "hidden")}>{children}</div>
    </section>
  );
}
