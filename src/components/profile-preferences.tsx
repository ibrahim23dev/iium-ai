"use client";

import { useState } from "react";

export default function ProfilePreferences({ theme, language }: { theme: string; language: string }) {
  const [appearance, setAppearance] = useState(theme);
  const [locale, setLocale] = useState(language);
  const [message, setMessage] = useState("");
  const save = async (nextTheme: string, nextLanguage: string) => {
    setMessage("");
    const response = await fetch("/api/profile/preferences", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ theme: nextTheme, language: nextLanguage }) });
    setMessage(response.ok ? "Preferences saved." : "Could not save preferences. Please try again.");
  };
  return <div className="profile-preferences"><h2>Preferences</h2><label>Appearance<select value={appearance} onChange={(event) => { const value = event.target.value; setAppearance(value); const dark = value === "dark" || (value === "system" && window.matchMedia("(prefers-color-scheme: dark)").matches); document.documentElement.dataset.theme = dark ? "dark" : "light"; localStorage.setItem("iium-ai-theme", value); void save(value, locale); }}><option value="system">System</option><option value="light">Light</option><option value="dark">Dark</option></select></label><label>Language preference<select value={locale} onChange={(event) => { setLocale(event.target.value); void save(appearance, event.target.value); }}><option value="en">English</option><option value="ms" disabled>Bahasa Melayu (coming soon)</option><option value="ar" disabled>العربية (coming soon)</option></select></label>{message && <p role="status">{message}</p>}</div>;
}
