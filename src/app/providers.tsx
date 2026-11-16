"use client";

import { SessionProvider } from "next-auth/react";
import { App as AntApp, ConfigProvider, theme as antTheme } from "antd";
import { createContext, useContext, useEffect, useState } from "react";

type ThemeMode = "light" | "dark" | "system";
type Ctx = { mode: ThemeMode; setMode: (m: ThemeMode) => void; isDark: boolean };
const ThemeCtx = createContext<Ctx>({ mode: "system", setMode: () => {}, isDark: false });
export const useTheme = () => useContext(ThemeCtx);

export function Providers({ children }: { children: React.ReactNode }) {
  const [mode, setModeState] = useState<ThemeMode>(() => {
    if (typeof window === "undefined") return "system";
    const saved = localStorage.getItem("iium-ai-theme");
    return saved === "light" || saved === "dark" || saved === "system" ? saved : "system";
  });
  const [isDark, setIsDark] = useState(false);

  useEffect(() => {
    const apply = () => {
      const dark = mode === "dark" || (mode === "system" && window.matchMedia("(prefers-color-scheme: dark)").matches);
      setIsDark(dark);
      document.documentElement.dataset.theme = dark ? "dark" : "light";
      document.documentElement.classList.toggle("dark", dark);
    };
    apply();
    localStorage.setItem("iium-ai-theme", mode);
    if (mode === "system") {
      const mq = window.matchMedia("(prefers-color-scheme: dark)");
      mq.addEventListener("change", apply);
      return () => mq.removeEventListener("change", apply);
    }
  }, [mode]);

  return (
    <SessionProvider>
      <ThemeCtx.Provider value={{ mode, setMode: setModeState, isDark }}>
        <ConfigProvider
          theme={{
            algorithm: isDark ? antTheme.darkAlgorithm : antTheme.defaultAlgorithm,
            token: {
              colorPrimary: "#2563eb",
              borderRadius: 10,
              fontFamily: "var(--font-inter), system-ui, sans-serif",
              colorBgContainer: isDark ? "#111a2e" : "#ffffff",
              colorBorder: isDark ? "#1e293b" : "#e2e8f0",
            },
            components: {
              Button: { controlHeight: 38, borderRadius: 10, fontWeight: 500 },
              Input: { borderRadius: 10 },
              Select: { borderRadius: 10 },
              Dropdown: { borderRadiusLG: 12 },
            },
          }}
        >
          <AntApp>{children}</AntApp>
        </ConfigProvider>
      </ThemeCtx.Provider>
    </SessionProvider>
  );
}
