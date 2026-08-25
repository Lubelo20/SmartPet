export type ThemeChoice = "system" | "light" | "dark";

export const THEME_KEY = "feeder.theme";

/**
 * Runs before React hydrates, inlined into <head>. It must be self-contained
 * and synchronous: resolving the theme after first paint is what produces the
 * white flash dark-mode users notice on every single navigation.
 *
 * Kept as a string rather than a function so it can be inlined verbatim, and
 * deliberately tolerant — a browser that blocks storage still renders, just at
 * the system preference.
 */
export const THEME_SCRIPT = `(function(){try{
var c=localStorage.getItem(${JSON.stringify(THEME_KEY)});
var d=c==="dark"||((!c||c==="system")&&window.matchMedia("(prefers-color-scheme: dark)").matches);
document.documentElement.classList.toggle("dark",d);
}catch(e){}})();`;

/** What the choice resolves to right now. */
export function resolveTheme(choice: ThemeChoice): "light" | "dark" {
  if (choice === "light" || choice === "dark") return choice;
  if (typeof window === "undefined") return "light";
  return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
}

export function readThemeChoice(): ThemeChoice {
  if (typeof window === "undefined") return "system";
  try {
    const v = window.localStorage.getItem(THEME_KEY);
    return v === "light" || v === "dark" || v === "system" ? v : "system";
  } catch {
    return "system";
  }
}

export function applyTheme(choice: ThemeChoice): void {
  if (typeof document === "undefined") return;
  document.documentElement.classList.toggle("dark", resolveTheme(choice) === "dark");
  try {
    window.localStorage.setItem(THEME_KEY, choice);
  } catch {
    // Private windows and full quotas land here; the class is already applied,
    // so this session is correct even though the choice will not persist.
  }
}
