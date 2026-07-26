"use client";

import { type ReactNode, useEffect, useRef, useState } from "react";

interface DeferredRenderProps {
  children: ReactNode;
  className?: string;
  minHeight?: number;
  rootMargin?: string;
}

export function DeferredRender({
  children,
  className = "",
  minHeight = 240,
  rootMargin = "420px 0px",
}: DeferredRenderProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    if (ready) return;
    const container = containerRef.current;
    if (!container) return;

    const Observer = (globalThis as { IntersectionObserver?: typeof IntersectionObserver }).IntersectionObserver;
    if (!Observer) {
      const frame = requestAnimationFrame(() => setReady(true));
      return () => cancelAnimationFrame(frame);
    }

    const observer = new Observer(
      (entries) => {
        if (!entries.some((entry) => entry.isIntersecting)) return;
        setReady(true);
        observer.disconnect();
      },
      { rootMargin },
    );
    observer.observe(container);
    return () => observer.disconnect();
  }, [ready, rootMargin]);

  return (
    <div
      ref={containerRef}
      className={`deferred-render${ready ? " ready" : ""}${className ? ` ${className}` : ""}`}
      style={ready ? undefined : { minHeight }}
    >
      {ready ? children : <div className="deferred-placeholder" aria-hidden="true" />}
    </div>
  );
}
