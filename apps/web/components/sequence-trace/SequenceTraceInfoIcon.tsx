"use client";

import { useCallback, useRef, useState } from "react";
import { Info } from "lucide-react";
import { useDismissOnOutside } from "@/lib/hooks/useDismissOnOutside";
import { cn } from "@/lib/utils";

export const SEQUENCE_TRACE_TOOLTIP_TEXT =
  "Track the position of selected sequences across phylogenetic trees built with different algorithms.";

type SequenceTraceInfoIconProps = {
  className?: string;
};

export default function SequenceTraceInfoIcon({ className }: SequenceTraceInfoIconProps) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLSpanElement>(null);
  const close = useCallback(() => setOpen(false), []);
  useDismissOnOutside(rootRef, close, open);

  return (
    <span ref={rootRef} className="relative inline-flex">
      <button
        type="button"
        aria-label="What is Sequence Trace?"
        aria-expanded={open}
        title={SEQUENCE_TRACE_TOOLTIP_TEXT}
        onClick={() => setOpen((prev) => !prev)}
        className={cn(
          "inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-sm text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 pointer-coarse:size-11",
          className,
        )}
      >
        <Info className="h-3.5 w-3.5 pointer-coarse:size-4" aria-hidden="true" />
      </button>
      {open && (
        <span
          role="tooltip"
          className="z-50 rounded-md border bg-popover p-3 text-xs font-normal leading-relaxed text-popover-foreground shadow-lg max-md:fixed max-md:inset-x-4 max-md:top-20 md:absolute md:left-0 md:top-full md:mt-1 md:w-64"
        >
          {SEQUENCE_TRACE_TOOLTIP_TEXT}
        </span>
      )}
    </span>
  );
}
