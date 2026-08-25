"use client";

import { useCallback, useEffect, useState } from "react";
import { applyTheme, readThemeChoice, resolveTheme, type ThemeChoice } from "@/lib/theme";

/**
 * The stored choice plus what it currently resolves to. Reading localStorage in
 * a state initialiser would run during the server render and mismatch on
 * hydration, so the effect adopts the real value on mount — the inline script
 * has already applied the correct class, so nothing flashes in the meantime.
 */
export function useTheme() {
  const [choice, setChoice] = useState<ThemeChoice>("system");
  const [resolved, setResolved] = useState<"light" | "dark">("light");

  useEffect(() => {
    const c = readThemeChoice();
    setChoice(c);
    setResolved(resolveTheme(c));
  }, []);

  // Follow the OS while the choice is "system".
  useEffect(() => {
    if (choice !== "system" || typeof window === "undefined") return;
    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    const onChange = () => {
      applyTheme("system");
      setResolved(resolveTheme("system"));
    };
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, [choice]);

  const setTheme = useCallback((next: ThemeChoice) => {
    applyTheme(next);
    setChoice(next);
    setResolved(resolveTheme(next));
  }, []);

  return { choice, resolved, setTheme };
}
