"use client";

import { useEffect, useMemo, useRef } from "react";
import { Check, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { computeNodes, type RenderNode } from "./runStageNodes";

const DOT_BY_STATE: Record<RenderNode["state"], string> = {
  done: "border-primary bg-primary text-primary-foreground",
  active: "border-primary/50 bg-primary/10 text-primary",
  pending: "border-border bg-muted text-muted-foreground",
  error: "border-destructive bg-destructive/10 text-destructive",
  cancelled: "border-dashed border-destructive/60 bg-destructive/5 text-destructive",
};

const LABEL_BY_STATE: Record<RenderNode["state"], string> = {
  done: "text-foreground",
  active: "font-medium text-foreground",
  pending: "text-muted-foreground",
  error: "font-medium text-destructive",
  cancelled: "text-destructive",
};

/** Animated dashed ring around the currently-running stage. */
function MarchingRing() {
  return (
    <svg
      className="pointer-events-none absolute inset-[-4px] h-[calc(100%+8px)] w-[calc(100%+8px)] text-primary"
      viewBox="0 0 36 36"
      fill="none"
      aria-hidden="true"
    >
      <circle
        cx="18"
        cy="18"
        r="16"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeDasharray="5 4"
        className="phylo-marching"
      />
    </svg>
  );
}

export default function RunStageFlowchart({
  methodId,
  status,
  stage,
}: {
  methodId?: string | null;
  status?: string;
  stage?: string | null;
  progress?: number;
  stageMessage?: string | null;
}) {
  const nodes = useMemo(() => computeNodes(methodId, status, stage), [methodId, status, stage]);
  const activeIndex = nodes.findIndex((node) => node.state === "active");
  const listRef = useRef<HTMLOListElement>(null);

  // Where the row scrolls sideways, keep the running stage in view. Sets scrollLeft
  // rather than using scrollIntoView, which would also move the page under the user.
  useEffect(() => {
    const list = listRef.current;
    const active = list?.children[activeIndex];
    if (list && active instanceof HTMLElement) {
      list.scrollLeft = active.offsetLeft - list.offsetLeft - list.clientWidth / 2;
    }
  }, [activeIndex]);

  return (
    <div className="space-y-2">
      <span className="text-xs font-medium text-muted-foreground">Pipeline</span>
      <div className="flex justify-center">
        {/* Scrolls sideways on phones: wrapping would leave connectors dangling at row ends. */}
        <ol
          ref={listRef}
          className="relative flex min-w-0 items-start gap-y-3 overflow-x-auto pb-1 sm:flex-wrap sm:justify-center sm:overflow-visible sm:pb-0"
        >
        {nodes.map((node, i) => {
          const isLast = i === nodes.length - 1;
          return (
            <li key={`${node.id}-${i}`} className="flex shrink-0 items-start">
              <div className="flex w-[84px] flex-col items-center gap-1 text-center">
                <span className="relative flex size-7 items-center justify-center">
                  {node.state === "active" && <MarchingRing />}
                  <span
                    className={cn(
                      "flex size-7 items-center justify-center rounded-full border text-[11px] font-semibold",
                      DOT_BY_STATE[node.state],
                    )}
                  >
                    {node.state === "done" ? (
                      <Check className="size-4" />
                    ) : node.state === "error" || node.state === "cancelled" ? (
                      <X className="size-4" />
                    ) : (
                      i + 1
                    )}
                  </span>
                </span>
                <span className={cn("text-[11px] leading-tight", LABEL_BY_STATE[node.state])}>
                  {node.label}
                </span>
              </div>
              {!isLast && (
                <span
                  className={cn(
                    "mt-[13px] h-px w-5 sm:w-7",
                    node.state === "done" ? "bg-primary" : "bg-border",
                  )}
                  aria-hidden="true"
                />
              )}
            </li>
          );
        })}
        </ol>
      </div>
    </div>
  );
}
