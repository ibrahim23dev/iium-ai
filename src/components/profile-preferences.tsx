"use client";

import { useState } from "react";
import { useTheme } from "@/app/providers";

export default function ProfilePreferences({ theme, language }: { theme: string; language: string }) {
  const { setMode } = useTheme();
  const [appearance, setAppearance] = useState(theme);
  const [locale, setLocale] = useState(language);
  const [message, setMessage] = useState("");
  const save = async (nextTheme: string, nextLanguage: string) => {
    setMessage("");
    try {
      const response = await fetch("/api/profile/preferences", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ theme: nextTheme, language: nextLanguage }) });
      if (!response.ok) throw new Error("Preference update failed.");
      setMessage("Preferences saved.");
    } catch {
      setMessage("Could not save preferences. Check your connection and try again.");
    }
  };
  return <div className="profile-preferences"><h2>Preferences</h2><label>Appearance<select value={appearance} onChange={(event) => { const value = event.target.value; setAppearance(value); setMode(value as "system" | "light" | "dark"); void save(value, locale); }}><option value="system">System</option><option value="light">Light</option><option value="dark">Dark</option></select></label><label>Language preference<select value={locale} onChange={(event) => { const value = event.target.value; setLocale(value); void save(appearance, value); }}><option value="en">English</option><option value="ms" disabled>Bahasa Melayu (coming soon)</option><option value="ar" disabled>العربية (coming soon)</option></select></label>{message && <p role="status">{message}</p>}</div>;
}
