"use client";

import { useEffect, useRef, useState } from "react";
import { TOAST_EVENT, type ToastEventDetail } from "@/lib/toast";

export function ToastViewport() {
  const [toasts, setToasts] = useState<ToastEventDetail[]>([]);
  const timers = useRef(new Map<string, number>());
  const recentlySeen = useRef(new Map<string, number>());

  function dismiss(id: string) {
    const timer = timers.current.get(id);
    if (timer) window.clearTimeout(timer);
    timers.current.delete(id);
    setToasts((current) => current.filter((toast) => toast.id !== id));
  }

  useEffect(() => {
    const activeTimers = timers.current;
    const seenMessages = recentlySeen.current;
    function receive(event: Event) {
      const toast = (event as CustomEvent<ToastEventDetail>).detail;
      if (!toast?.message) return;
      const dedupeKey = `${toast.tone}:${toast.message}`;
      const now = Date.now();
      if (now - (seenMessages.get(dedupeKey) ?? 0) < 1_200) return;
      seenMessages.set(dedupeKey, now);
      setToasts((current) => [...current.slice(-2), toast]);
      const duration = toast.tone === "error" ? 5_500 : 3_000;
      activeTimers.set(toast.id, window.setTimeout(() => dismiss(toast.id), duration));
    }
    window.addEventListener(TOAST_EVENT, receive);
    return () => {
      window.removeEventListener(TOAST_EVENT, receive);
      activeTimers.forEach((timer) => window.clearTimeout(timer));
      activeTimers.clear();
      seenMessages.clear();
    };
  }, []);

  return (
    <div className="toast-viewport" aria-live="polite" aria-atomic="false">
      {toasts.map((toast) => (
        <div className={`app-toast ${toast.tone}`} role={toast.tone === "error" ? "alert" : "status"} key={toast.id}>
          <span className="toast-icon" aria-hidden="true">{toast.tone === "success" ? "✓" : toast.tone === "error" ? "!" : "i"}</span>
          <p>{toast.message}</p>
          <button type="button" onClick={() => dismiss(toast.id)} aria-label="알림 닫기">×</button>
        </div>
      ))}
    </div>
  );
}
