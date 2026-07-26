"use client";

import { type KeyboardEvent, type PointerEvent, useEffect, useRef, useState } from "react";

const LONG_PRESS_MS = 380;
const MOVE_CANCEL_DISTANCE = 10;

interface PressStart {
  clientX: number;
  clientY: number;
  pointerId: number;
  target: SVGSVGElement;
}

export function useChartScrubber(itemCount: number) {
  const [activeIndex, setActiveIndex] = useState<number | null>(null);
  const pressStartRef = useRef<PressStart | null>(null);
  const longPressTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const scrubbingRef = useRef(false);

  function clearTimer() {
    if (!longPressTimerRef.current) return;
    clearTimeout(longPressTimerRef.current);
    longPressTimerRef.current = null;
  }

  useEffect(() => () => clearTimer(), []);

  function indexFromPointer(target: SVGSVGElement, clientX: number): number {
    const bounds = target.getBoundingClientRect();
    const ratio = Math.max(0, Math.min(1, (clientX - bounds.left) / Math.max(bounds.width, 1)));
    return Math.round(ratio * Math.max(0, itemCount - 1));
  }

  function onPointerDown(event: PointerEvent<SVGSVGElement>) {
    if (!itemCount) return;
    if (event.pointerType === "mouse") {
      setActiveIndex(indexFromPointer(event.currentTarget, event.clientX));
      return;
    }

    clearTimer();
    pressStartRef.current = {
      clientX: event.clientX,
      clientY: event.clientY,
      pointerId: event.pointerId,
      target: event.currentTarget,
    };
    longPressTimerRef.current = setTimeout(() => {
      const press = pressStartRef.current;
      if (!press) return;
      scrubbingRef.current = true;
      setActiveIndex(indexFromPointer(press.target, press.clientX));
      try {
        press.target.setPointerCapture(press.pointerId);
      } catch {
        // Pointer capture is an enhancement; the selected value still remains visible.
      }
      longPressTimerRef.current = null;
    }, LONG_PRESS_MS);
  }

  function onPointerMove(event: PointerEvent<SVGSVGElement>) {
    if (!itemCount) return;
    if (event.pointerType === "mouse") {
      setActiveIndex(indexFromPointer(event.currentTarget, event.clientX));
      return;
    }

    const press = pressStartRef.current;
    if (!press || press.pointerId !== event.pointerId) return;
    const moved = Math.hypot(event.clientX - press.clientX, event.clientY - press.clientY);
    if (!scrubbingRef.current && moved > MOVE_CANCEL_DISTANCE) {
      clearTimer();
      pressStartRef.current = null;
      return;
    }
    if (!scrubbingRef.current) return;
    event.preventDefault();
    setActiveIndex(indexFromPointer(event.currentTarget, event.clientX));
  }

  function finishPointer(event: PointerEvent<SVGSVGElement>) {
    const dismissPinnedValue = !scrubbingRef.current && pressStartRef.current !== null && activeIndex !== null;
    clearTimer();
    if (scrubbingRef.current) {
      try {
        event.currentTarget.releasePointerCapture(event.pointerId);
      } catch {
        // The pointer may already have been released by the browser.
      }
    }
    scrubbingRef.current = false;
    pressStartRef.current = null;
    if (dismissPinnedValue) setActiveIndex(null);
  }

  function onPointerLeave(event: PointerEvent<SVGSVGElement>) {
    if (event.pointerType === "mouse") setActiveIndex(null);
  }

  function onKeyDown(event: KeyboardEvent<SVGSVGElement>) {
    if (!itemCount) return;
    if (!["ArrowLeft", "ArrowRight", "Home", "End", "Enter", " "].includes(event.key)) return;
    event.preventDefault();
    if (event.key === "Home") setActiveIndex(0);
    else if (event.key === "End" || event.key === "Enter" || event.key === " ") setActiveIndex(itemCount - 1);
    else {
      const current = activeIndex ?? itemCount - 1;
      setActiveIndex(Math.max(0, Math.min(itemCount - 1, current + (event.key === "ArrowLeft" ? -1 : 1))));
    }
  }

  return {
    activeIndex: activeIndex === null ? null : Math.min(activeIndex, Math.max(0, itemCount - 1)),
    clear: () => setActiveIndex(null),
    handlers: {
      onKeyDown,
      onPointerCancel: finishPointer,
      onPointerDown,
      onPointerLeave,
      onPointerMove,
      onPointerUp: finishPointer,
    },
  };
}
