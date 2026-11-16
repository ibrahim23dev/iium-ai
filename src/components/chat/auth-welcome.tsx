"use client";

import { useEffect, useState } from "react";
import Image from "next/image";
import { signIn } from "next-auth/react";
import { Alert, App as AntApp, Button, Input } from "antd";
import { ArrowRight, LockKeyhole, Mail } from "lucide-react";

type Props = { googleAvailable: boolean; googleUnavailableReason: string; manualAuthAvailable: boolean; onGoogle: () => void; onGuest: () => void };

export function AuthWelcome({ googleAvailable, googleUnavailableReason, manualAuthAvailable, onGoogle, onGuest }: Props) {
  const { message } = AntApp.useApp();
  const [mode, setMode] = useState<"signin" | "register">("signin");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [oauthError, setOauthError] = useState("");

  useEffect(() => {
    const url = new URL(window.location.href);
    const code = url.searchParams.get("error");
    if (!code) return;
    const messages: Record<string, string> = {
      AccessDenied: "Google denied the sign-in request. Check the consent screen and allowed test users.",
      OAuthAccountNotLinked: "This email already has a different sign-in method. Sign in with that method first.",
      OAuthCallbackError: "Google OAuth callback failed. Check the client secret and authorized redirect URI.",
      Configuration: "Authentication is not configured correctly on the server. Check AUTH_SECRET and Google OAuth credentials.",
    };
    const message = messages[code] || `Google sign-in failed (${code}). Check the server logs and OAuth settings.`;
    window.setTimeout(() => setOauthError(message), 0);
    url.searchParams.delete("error");
    window.history.replaceState({}, "", `${url.pathname}${url.search}${url.hash}`);
  }, []);

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (busy) return;
    setBusy(true);
    try {
      if (mode === "register") {
        const response = await fetch("/api/auth/register", {
          method: "POST", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ name, email, password }),
        });
        const result = await response.json() as { error?: string };
        if (!response.ok) throw new Error(result.error || "Could not create your account.");
      }
      const result = await signIn("credentials", { email, password, redirect: false, callbackUrl: "/" });
      if (result?.error) throw new Error("Email or password is incorrect.");
      window.location.assign(result?.url || "/");
    } catch (error) {
      message.error(error instanceof Error ? error.message : "Authentication failed. Please try again.");
    } finally { setBusy(false); }
  };

  return <main className="grid min-h-[100dvh] place-items-center bg-gradient-to-br from-emerald-50 via-white to-teal-50 p-4 dark:from-slate-950 dark:via-slate-900 dark:to-emerald-950/30">
    <section className="w-full max-w-[440px] rounded-3xl border border-[var(--border)] bg-[var(--bg-card)] p-7 shadow-2xl shadow-emerald-950/10 sm:p-9">
      <div className="text-center"><Image src="/icon.png" alt="IIUM AI" width={68} height={56} priority className="mx-auto" /><p className="mt-5 text-[10px] font-semibold tracking-[0.22em] text-brand-600">YOUR INTELLIGENT AI WORKSPACE</p><h1 className="mt-2 text-3xl font-bold tracking-tight">Welcome to IIUM AI</h1><p className="mt-2 text-sm leading-6 text-[var(--fg-muted)]">Ask questions, develop ideas and get meaningful work done.</p></div>
      <form onSubmit={submit} className="mt-7 space-y-3">
        {mode === "register" && <Input size="large" autoComplete="name" placeholder="Your name" value={name} onChange={(event) => setName(event.target.value)} required maxLength={100} />}
        <Input size="large" type="email" autoComplete="email" prefix={<Mail size={16} />} placeholder="Email address" value={email} onChange={(event) => setEmail(event.target.value)} required maxLength={254} />
        <Input.Password size="large" autoComplete={mode === "register" ? "new-password" : "current-password"} prefix={<LockKeyhole size={16} />} placeholder={mode === "register" ? "Password (10+ characters)" : "Password"} value={password} onChange={(event) => setPassword(event.target.value)} required minLength={mode === "register" ? 10 : 1} maxLength={200} />
        {!manualAuthAvailable && <p className="text-xs leading-5 text-[var(--fg-muted)]">Email accounts require a reachable MongoDB database and AUTH_SECRET.</p>}
        <Button htmlType="submit" type="primary" size="large" block loading={busy} disabled={!manualAuthAvailable} className="!h-11">{mode === "signin" ? "Sign in with email" : "Create account"}</Button>
      </form>
      <button className="mt-3 w-full py-1 text-sm text-brand-600 hover:underline" onClick={() => setMode(mode === "signin" ? "register" : "signin")}>{mode === "signin" ? "New here? Create an account" : "Already have an account? Sign in"}</button>
      <div className="my-5 flex items-center gap-3 text-xs text-[var(--fg-muted)]"><span className="h-px flex-1 bg-[var(--border)]" />or continue with<span className="h-px flex-1 bg-[var(--border)]" /></div>
      <div className="space-y-2"><Button block size="large" disabled={!googleAvailable} onClick={onGoogle} icon={<GoogleMark />}>Continue with Google</Button><Button block size="large" onClick={onGuest} icon={<ArrowRight size={15} />}>Continue as Guest</Button></div>
      {!googleAvailable && <Alert className="mt-3 text-left" type="warning" showIcon message="Google sign-in is unavailable" description={googleUnavailableReason || "Check the server configuration, MongoDB connection and restart the app."} />}
      {oauthError && <Alert className="mt-3 text-left" type="error" showIcon message={oauthError} />}
      <p className="mt-5 text-center text-[11px] leading-5 text-[var(--fg-muted)]">Guest chats stay in this browser. Accounts can sync chat history when MongoDB is online.</p>
      <p className="mt-6 text-center text-[10px] text-[var(--fg-muted)]">IIUM AI · Created by Mohammad Ibrahim</p>
    </section>
  </main>;
}

function GoogleMark() {
  return <svg aria-hidden="true" viewBox="0 0 48 48" width="17" height="17"><path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5Z"/><path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.91c-.58 2.96-2.26 5.47-4.74 7.18l7.72 5.99c4.51-4.17 7.09-10.32 7.09-17.64Z"/><path fill="#FBBC05" d="M10.53 28.59a14.4 14.4 0 0 1 0-9.18l-7.98-6.19a23.92 23.92 0 0 0 0 21.56l7.98-6.19Z"/><path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.72-5.99c-2.14 1.44-4.88 2.3-8.17 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48Z"/></svg>;
}
