import { useLayoutEffect, useMemo, useState } from "react";

export type AppTheme = "system" | "light" | "dark";

const storageKey = "imessage-exporter-gui.theme";

export function useAppTheme() {
  const [theme, setThemeState] = useState<AppTheme>(() => detectInitialTheme());

  useLayoutEffect(() => {
    if (typeof window === "undefined") return;

    const media = window.matchMedia("(prefers-color-scheme: dark)");
    const apply = () => applyTheme(theme, media.matches);
    apply();

    if (theme === "system") {
      media.addEventListener("change", apply);
      return () => media.removeEventListener("change", apply);
    }
  }, [theme]);

  return useMemo(
    () => ({
      theme,
      setTheme(next: AppTheme) {
        setThemeState(next);
        try {
          window.localStorage.setItem(storageKey, next);
        } catch {
          // The visual preference still applies for this session.
        }
      },
    }),
    [theme],
  );
}

function applyTheme(theme: AppTheme, systemPrefersDark: boolean) {
  const resolved = theme === "system" ? (systemPrefersDark ? "dark" : "light") : theme;
  document.documentElement.dataset.theme = resolved;
  document.documentElement.dataset.themePreference = theme;
}

function detectInitialTheme(): AppTheme {
  if (typeof window === "undefined") return "system";
  try {
    const stored = window.localStorage.getItem(storageKey);
    if (stored === "system" || stored === "light" || stored === "dark") return stored;
  } catch {
    // Ignore storage failures and fall back to the device preference.
  }
  return "system";
}
