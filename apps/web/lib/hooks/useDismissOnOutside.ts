"use client";

import {
  useEffect,
  useRef,
  type MouseEvent as ReactMouseEvent,
  type PointerEvent as ReactPointerEvent,
  type RefObject,
} from "react";

/**
 * Calls `onDismiss` when a press lands outside `ref` while `active`. Listens for
 * `pointerdown` because iOS does not send `mousedown` for taps on content that
 * is not clickable, which left popovers stuck open.
 */
export function useDismissOnOutside(
  ref: RefObject<HTMLElement | null>,
  onDismiss: () => void,
  active: boolean,
): void {
  useEffect(() => {
    if (!active) return;
    const onPointerDown = (event: PointerEvent) => {
      if (event.target instanceof Node && !ref.current?.contains(event.target)) onDismiss();
    };
    document.addEventListener("pointerdown", onPointerDown);
    return () => document.removeEventListener("pointerdown", onPointerDown);
  }, [ref, onDismiss, active]);
}

/**
 * Props for a modal backdrop that closes when pressed. Closes on `click`, never
 * on the press itself: unmounting on `pointerdown` would send the tap's click to
 * whatever lies underneath. The press is checked as well so that a text selection
 * dragged out of the panel, which clicks the backdrop, does not close the modal.
 */
export function useBackdropDismiss(onDismiss: () => void) {
  const pressedBackdrop = useRef(false);
  return {
    onPointerDown: (event: ReactPointerEvent) => {
      pressedBackdrop.current = event.target === event.currentTarget;
    },
    onClick: (event: ReactMouseEvent) => {
      if (pressedBackdrop.current && event.target === event.currentTarget) onDismiss();
    },
  };
}
