export type ToastTone = "success" | "error" | "info";

export interface ToastEventDetail {
  id: string;
  message: string;
  tone: ToastTone;
}

export const TOAST_EVENT = "blackturtle-toast";

export function showToast(message: string, tone: ToastTone = "success"): void {
  if (typeof window === "undefined") return;
  const detail: ToastEventDetail = {
    id: `${Date.now()}-${Math.random().toString(36).slice(2)}`,
    message,
    tone,
  };
  window.dispatchEvent(new CustomEvent<ToastEventDetail>(TOAST_EVENT, { detail }));
}
