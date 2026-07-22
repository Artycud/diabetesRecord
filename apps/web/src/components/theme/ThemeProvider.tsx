"use client";

import { ThemeProvider as NextThemesProvider } from "next-themes";
import { createContext, useContext, useState, useEffect } from "react";

type AccentColor = "mint" | "peach" | "purple" | "blue" | "pink" | "yellow";
type CardStyle = "neumorphic" | "liquidGlass" | "flat";

interface ThemeContextValue {
  accent: AccentColor;
  setAccent: (a: AccentColor) => void;
  cardStyle: CardStyle;
  setCardStyle: (s: CardStyle) => void;
}

const ThemeContext = createContext<ThemeContextValue>({
  accent: "mint",
  setAccent: () => {},
  cardStyle: "neumorphic",
  setCardStyle: () => {},
});

export function useThemeConfig() {
  return useContext(ThemeContext);
}

export const ACCENT_COLORS: Record<AccentColor, string> = {
  mint:   "#01D19B",
  peach:  "#FF7A4A",
  purple: "#A855F7",
  blue:   "#3B82F6",
  pink:   "#EC4899",
  yellow: "#F59E0B",
};

// Old option names (pre-Neumorphism/Liquid-Glass pass) already shipped, so
// a saved localStorage value from before this change must still resolve to
// something valid rather than silently rendering with no appearance class.
const LEGACY_CARD_STYLE_MAP: Record<string, CardStyle> = {
  solid: "flat",
  glass: "liquidGlass",
  gradient: "neumorphic",
};

function normalizeCardStyle(value: string): CardStyle {
  if (value === "neumorphic" || value === "liquidGlass" || value === "flat") return value;
  return LEGACY_CARD_STYLE_MAP[value] ?? "neumorphic";
}

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [accent, setAccentState] = useState<AccentColor>("mint");
  const [cardStyle, setCardStyleState] = useState<CardStyle>("neumorphic");

  useEffect(() => {
    const a = localStorage.getItem("accent") as AccentColor | null;
    const c = localStorage.getItem("cardStyle");
    if (a) {
      setAccentState(a);
      document.documentElement.style.setProperty("--color-mint-500", ACCENT_COLORS[a]);
    }
    if (c) setCardStyleState(normalizeCardStyle(c));
  }, []);

  const setAccent = (a: AccentColor) => {
    setAccentState(a);
    localStorage.setItem("accent", a);
    document.documentElement.style.setProperty("--color-mint-500", ACCENT_COLORS[a]);
  };

  const setCardStyle = (s: CardStyle) => {
    setCardStyleState(s);
    localStorage.setItem("cardStyle", s);
  };

  return (
    <NextThemesProvider
      attribute="data-theme"
      themes={["system", "light", "dark"]}
      defaultTheme="system"
      enableSystem={false}
      disableTransitionOnChange
    >
      <ThemeContext.Provider value={{ accent, setAccent, cardStyle, setCardStyle }}>
        {children}
      </ThemeContext.Provider>
    </NextThemesProvider>
  );
}
