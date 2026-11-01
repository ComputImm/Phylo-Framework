"use client";

import { useEffect, type ReactNode } from "react";
import { X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useBackdropDismiss } from "@/lib/hooks/useDismissOnOutside";
import { cn } from "@/lib/utils";

/**
 * Lightweight modal and drawer (tree settings, downloads, node details, the phone
 * menu). Hand-built to match the existing CompareExpandDialog pattern — fixed
 * overlay, ESC + click-outside close, body-scroll lock — so we don't pull in a new
 * Radix dialog dependency.
 */
export default function Overlay({
  open,
  onClose,
  title,
  description,
  side = "center",
  mode = "fixed",
  size = "default",
  className,
  children,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  description?: string;
  /** `center` = modal; `left`/`right` = drawer. */
  side?: "center" | "left" | "right";
  /** `fixed` = over the page; `contained` = over the nearest positioned ancestor. */
  mode?: "fixed" | "contained";
  /** `full` = near-fullscreen panel (for the expand dialog). */
  size?: "default" | "full";
  className?: string;
  children: ReactNode;
}) {
  const contained = mode === "contained";
  const backdropProps = useBackdropDismiss(onClose);

  useEffect(() => {
    if (!open) return;
    // Contained overlays sit inside a section, so they don't lock page scroll.
    const prevOverflow = contained ? null : document.body.style.overflow;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    if (!contained) document.body.style.overflow = "hidden";
    document.addEventListener("keydown", onKeyDown);
    return () => {
      if (!contained && prevOverflow !== null) document.body.style.overflow = prevOverflow;
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [onClose, open, contained]);

  if (!open) return null;

  const isDrawer = side === "left" || side === "right";
  const isFull = !isDrawer && size === "full";

  return (
    <div
      className={cn(
        "z-50 flex overscroll-contain bg-black/60",
        contained ? "absolute inset-0" : "fixed inset-0",
        !isDrawer && (contained ? "p-3" : isFull ? "sm:p-5" : "p-3 sm:p-5"),
        side === "left" && "justify-start",
        side === "right" && "justify-end",
        side === "center" && "items-center justify-center",
      )}
      role="dialog"
      aria-modal="true"
      {...backdropProps}
    >
      <div
        className={cn(
          "flex max-h-full flex-col rounded-lg border bg-background shadow-xl",
          isDrawer
            ? cn("h-full", contained ? "w-72 max-w-[85%]" : "w-full max-w-sm")
            : isFull
              ? "h-full w-full max-sm:rounded-none max-sm:border-0 sm:max-w-[98vw]"
              : "w-full max-w-lg",
          className,
        )}
      >
        <div className="flex items-start justify-between gap-2 border-b px-4 py-3">
          <div className="min-w-0 space-y-0.5">
            <h3 className="truncate text-base font-semibold">{title}</h3>
            {description ? (
              <p className="text-xs text-muted-foreground">{description}</p>
            ) : null}
          </div>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            onClick={onClose}
            aria-label="Close"
            className="shrink-0"
          >
            <X className="size-4" />
          </Button>
        </div>
        <div className={cn("min-h-0 flex-1 overflow-auto overscroll-contain", isFull ? "p-2 sm:p-4" : "p-4")}>
          {children}
        </div>
      </div>
    </div>
  );
}
