import {
  useEffect,
  useState,
} from "react";

export type Theme = "dark" | "light";

const STORAGE_KEY = "boukensha-observatory-theme";

function initialTheme(): Theme {
  const saved = window.localStorage.getItem(STORAGE_KEY);
  if (saved === "dark" || saved === "light") return saved;
  // Dark until somebody chooses otherwise. The surface was designed dark and
  // is read in a dark room next to a game terminal, so following the desktop
  // preference meant a first visit from a light machine opened in the theme
  // the design was not built for.
  return "dark";
}

export function useTheme(): [Theme, (theme: Theme) => void] {
  const [theme, setTheme] = useState<Theme>(initialTheme);

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    window.localStorage.setItem(STORAGE_KEY, theme);
  }, [theme]);

  return [theme, setTheme];
}
