"use client";

import { useCallback, useSyncExternalStore } from "react";

// Mirrors Tailwind's default `md` and `lg` breakpoints and its `pointer-coarse`
// variant. Prefer CSS variants: read these only when behaviour, not styling, has
// to change.
export const BELOW_MD = "(max-width: 767.98px)";
export const BELOW_LG = "(max-width: 1023.98px)";
export const COARSE_POINTER = "(pointer: coarse)";
/** Narrow, or short: a phone on its side passes `md` but has no room for a tall pane. */
export const PHONE_SIZED = "(max-width: 767.98px), (max-height: 500px)";

const serverSnapshot = () => false;

/** Whether a media query matches. Always false during server rendering. */
export function useMediaQuery(query: string): boolean {
  const subscribe = useCallback(
    (onChange: () => void) => {
      const list = window.matchMedia(query);
      list.addEventListener("change", onChange);
      return () => list.removeEventListener("change", onChange);
    },
    [query],
  );
  const getSnapshot = useCallback(() => window.matchMedia(query).matches, [query]);
  return useSyncExternalStore(subscribe, getSnapshot, serverSnapshot);
}
