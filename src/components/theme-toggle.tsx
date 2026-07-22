"use client";

import { useSyncExternalStore } from "react";

type Theme = "dark" | "light";

const THEME_STORAGE_KEY = "blackturtle-theme";
const THEME_CHANGE_EVENT = "blackturtle-theme-change";

function readTheme(): Theme {
  return document.documentElement.dataset.theme === "light" ? "light" : "dark";
}

export function ThemeToggle() {
  const theme = useSyncExternalStore(
    (notify) => {
      window.addEventListener(THEME_CHANGE_EVENT, notify);
      window.addEventListener("storage", notify);
      return () => {
        window.removeEventListener(THEME_CHANGE_EVENT, notify);
        window.removeEventListener("storage", notify);
      };
    },
    readTheme,
    () => "light" as Theme,
  );

  function toggleTheme() {
    const nextTheme: Theme = readTheme() === "dark" ? "light" : "dark";
    document.documentElement.dataset.theme = nextTheme;
    document.documentElement.style.colorScheme = nextTheme;
    window.localStorage.setItem(THEME_STORAGE_KEY, nextTheme);
    window.dispatchEvent(new Event(THEME_CHANGE_EVENT));
  }

  const nextLabel = theme === "dark" ? "라이트 모드로 전환" : "다크 모드로 전환";

  return (
    <button className="theme-toggle" type="button" onClick={toggleTheme} aria-label={nextLabel} title={nextLabel}>
      <span aria-hidden="true">{theme === "dark" ? "☾" : "☀"}</span>
      <small>{theme === "dark" ? "다크" : "라이트"}</small>
    </button>
  );
}
