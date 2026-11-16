"use client";

import Image from "next/image";
import Link from "next/link";
import type { Session } from "next-auth";
import { App as AntApp, Avatar, Button, Dropdown, Input, Select, Tooltip } from "antd";
import {
  ArrowUp, ChevronRight, FileText, ImagePlus, Menu, MessageSquarePlus, Mic,
  MoreHorizontal, PanelLeftClose, PanelLeftOpen, Plus, Search,
  Settings2, ShieldCheck, Sparkles, X, Sun, Moon,
} from "lucide-react";
import type { RefObject } from "react";
import type { Attachment, Conversation } from "@/types/chat";
import { useTheme } from "@/app/providers";
import { MessageView } from "./message-view";
import { suggestions } from "./chat-utils";

type EntryMode = "checking" | "visitor" | "guest" | "account";
type Group = { label: string; items: Conversation[] };

type Props = {
  session: Session | null;
  entryMode: EntryMode;
  conversations: Conversation[];
  grouped: Group[];
  filteredCount: number;
  active: Conversation | null;
  activeId: string | null;
  setActiveId: (id: string | null) => void;
  collapsed: boolean;
  setCollapsed: (value: boolean) => void;
  mobileOpen: boolean;
  setMobileOpen: (value: boolean) => void;
  query: string;
  setQuery: (value: string) => void;
  googleAvailable: boolean;
  conversationSyncAvailable: boolean;
  streaming: boolean;
  copied: string | null;
  error: string;
  setError: (value: string) => void;
  draft: string;
  setDraft: (value: string) => void;
  files: Attachment[];
  setFiles: (value: Attachment[] | ((current: Attachment[]) => Attachment[])) => void;
  fileRef: RefObject<HTMLInputElement | null>;
  textareaRef: RefObject<HTMLTextAreaElement | null>;
  newChat: () => void;
  submit: () => void;
  stop: () => void;
  startVoice: () => void;
  addFiles: (list: FileList | null) => void;
  copyText: (content: string, id: string) => void;
  regenerate: (index: number) => void;
  toggleFeedback: (id: string, value: "up" | "down") => void;
  toggleSpeech: (content: string) => void;
  renameChat: (chat: Conversation) => void;
  deleteChat: (id: string) => void;
  endSession: () => void;
  beginGoogleSignIn: () => void;
  onThemeChange: (mode: "system" | "light" | "dark") => void;
};

export function ChatWorkspace(props: Props) {
  const { message } = AntApp.useApp();
  const { mode: themeMode, isDark } = useTheme();
  const {
    session, entryMode, grouped, filteredCount, active, activeId, setActiveId,
    collapsed, setCollapsed, mobileOpen, setMobileOpen, query, setQuery,
    googleAvailable, conversationSyncAvailable, streaming, copied, error, setError,
    draft, setDraft, files, setFiles, fileRef, textareaRef, newChat, submit, stop,
    startVoice, addFiles, copyText, regenerate, toggleFeedback, toggleSpeech,
    renameChat, deleteChat, endSession, beginGoogleSignIn, onThemeChange,
  } = props;

  return (
    <div className="flex h-[100dvh] w-full overflow-hidden bg-[var(--bg)] text-[var(--fg)]">
      <ChatSidebar
        session={session} grouped={grouped} filteredCount={filteredCount} activeId={activeId}
        setActiveId={setActiveId} collapsed={collapsed} setCollapsed={setCollapsed}
        mobileOpen={mobileOpen} setMobileOpen={setMobileOpen} query={query} setQuery={setQuery}
        googleAvailable={googleAvailable} newChat={newChat} renameChat={renameChat}
        deleteChat={deleteChat} endSession={endSession} beginGoogleSignIn={beginGoogleSignIn}
        onThemeChange={onThemeChange} isDark={isDark} message={message}
      />
      {mobileOpen && <button aria-label="Close navigation" className="fixed inset-0 z-30 bg-black/40 md:hidden" onClick={() => setMobileOpen(false)} />}
      <main className="flex min-w-0 flex-1 flex-col">
        <ChatHeader entryMode={entryMode} active={active} setMobileOpen={setMobileOpen} themeMode={themeMode} onThemeChange={onThemeChange} isDark={isDark} />
        <section className="flex min-h-0 flex-1 flex-col overflow-hidden">
          {active ? (
            <MessageList
              active={active} streaming={streaming} copied={copied} error={error} setError={setError}
              copyText={copyText} regenerate={regenerate} toggleFeedback={toggleFeedback} toggleSpeech={toggleSpeech}
            />
          ) : (
            <Welcome setDraft={setDraft} textareaRef={textareaRef} />
          )}
          <Composer
            draft={draft} setDraft={setDraft} files={files} setFiles={setFiles} fileRef={fileRef}
            textareaRef={textareaRef} addFiles={addFiles} startVoice={startVoice} submit={submit}
            stop={stop} streaming={streaming} conversationSyncAvailable={conversationSyncAvailable}
          />
        </section>
        <footer className="flex h-8 shrink-0 items-center justify-between px-4 text-[10px] text-[var(--fg-muted)] md:px-7">
          <span>IIUM AI · Created by Mohammad Ibrahim</span>
          <button onClick={() => setError("Help center is coming soon.")}>Help &amp; feedback</button>
        </footer>
      </main>
    </div>
  );
}

function ChatSidebar(props: {
  session: Session | null; grouped: Group[]; filteredCount: number; activeId: string | null;
  setActiveId: (id: string | null) => void; collapsed: boolean; setCollapsed: (v: boolean) => void;
  mobileOpen: boolean; setMobileOpen: (v: boolean) => void; query: string; setQuery: (v: string) => void;
  googleAvailable: boolean; newChat: () => void; renameChat: (chat: Conversation) => void;
  deleteChat: (id: string) => void; endSession: () => void; beginGoogleSignIn: () => void;
  onThemeChange: (mode: "system" | "light" | "dark") => void; isDark: boolean;
  message: ReturnType<typeof AntApp.useApp>["message"];
}) {
  const p = props;
  return (
    <aside className={`fixed inset-y-0 left-0 z-40 flex w-[280px] shrink-0 flex-col border-r border-[var(--border)] bg-[var(--bg-card)] transition-transform duration-200 md:relative md:translate-x-0 ${p.collapsed ? "md:w-[76px]" : "md:w-[280px]"} ${p.mobileOpen ? "translate-x-0" : "-translate-x-full"}`}>
      <div className="flex items-center justify-between border-b border-[var(--border)] px-4 py-4">
        <button onClick={p.newChat} className="flex min-w-0 items-center gap-2.5" aria-label="IIUM AI home">
          <Image src="/icon.png" alt="" width={32} height={26} priority />
          {!p.collapsed && <span className="min-w-0 text-left"><strong className="block text-[15px] leading-tight">IIUM AI</strong><small className="text-[11px] text-[var(--fg-muted)]">Think smarter. Create more.</small></span>}
        </button>
        <button onClick={() => p.setCollapsed(!p.collapsed)} className="hidden h-8 w-8 place-items-center rounded-lg text-[var(--fg-muted)] hover:bg-[var(--bg)] md:grid" aria-label={p.collapsed ? "Expand sidebar" : "Collapse sidebar"}>
          {p.collapsed ? <PanelLeftOpen size={17} /> : <PanelLeftClose size={17} />}
        </button>
        <button className="grid h-8 w-8 place-items-center rounded-lg hover:bg-[var(--bg)] md:hidden" onClick={() => p.setMobileOpen(false)} aria-label="Close navigation"><X size={18} /></button>
      </div>
      <div className="space-y-2 p-3">
        <Button type="primary" block icon={<Plus size={16} />} onClick={p.newChat} className="!h-10 !font-medium">{!p.collapsed && "New chat"}</Button>
        {!p.collapsed && <Input id="chat-search" placeholder="Search conversations" prefix={<Search size={15} />} value={p.query} onChange={(event) => p.setQuery(event.target.value)} allowClear />}
      </div>
      <nav className="flex-1 overflow-y-auto px-2 pb-4">
        {!p.collapsed && <>
          <div className="px-2 pb-1 pt-2 text-[10px] font-semibold tracking-widest text-[var(--fg-muted)]">YOUR SPACE</div>
          <SidebarLink icon={<MessageSquarePlus size={16} />} label="Projects" onClick={() => p.message.info("Projects are coming soon.")} />
          <SidebarLink icon={<Sparkles size={16} />} label="Explore AI tools" onClick={() => p.message.info("AI tools are coming soon.")} />
          <div className="px-2 pb-1 pt-4 text-[10px] font-semibold tracking-widest text-[var(--fg-muted)]">RECENT CHATS</div>
          {p.grouped.map((group) => group.items.length > 0 && <div key={group.label} className="mb-2">
            <div className="px-2 py-1 text-[10px] text-[var(--fg-muted)]">{group.label}</div>
            {group.items.map((chat) => <div key={chat.id} className={`group mb-0.5 flex cursor-pointer items-center gap-1 rounded-lg px-2 py-1.5 ${p.activeId === chat.id ? "bg-brand-50 dark:bg-slate-800" : "hover:bg-[var(--bg)]"}`} onClick={() => { p.setActiveId(chat.id); p.setMobileOpen(false); }}>
              <MessageSquarePlus size={15} className="shrink-0 text-[var(--fg-muted)]" /><span className="flex-1 truncate text-[13px]">{chat.title}</span>
              <Dropdown trigger={["click"]} menu={{ items: [{ key: "rename", label: "Rename" }, { key: "delete", label: "Delete", danger: true }], onClick: ({ key, domEvent }) => { domEvent.stopPropagation(); if (key === "rename") p.renameChat(chat); if (key === "delete") p.deleteChat(chat.id); } }}>
                <button className="rounded p-1 text-[var(--fg-muted)] opacity-0 hover:bg-[var(--border)] group-hover:opacity-100" onClick={(event) => event.stopPropagation()} aria-label={`Options for ${chat.title}`}><MoreHorizontal size={14} /></button>
              </Dropdown>
            </div>)}
          </div>)}
          {p.filteredCount === 0 && <p className="px-2 py-6 text-center text-xs text-[var(--fg-muted)]">{p.query ? "No matching chats" : "Your conversations will appear here"}</p>}
        </>}
      </nav>
      <div className="space-y-1 border-t border-[var(--border)] p-2">
        <Link href="/profile" className="flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm text-[var(--fg-muted)] hover:bg-[var(--bg)]"><Settings2 size={17} />{!p.collapsed && "Settings"}</Link>
        <Dropdown trigger={["click"]} placement="topRight" menu={{
          items: p.session?.user ? [
            { key: "profile", label: <Link href="/profile">My Profile &amp; settings</Link> },
            { key: "privacy", label: <Link href="/profile#data-privacy">Data &amp; Privacy</Link> },
            { key: "theme", label: `Switch to ${p.isDark ? "light" : "dark"} appearance` }, { type: "divider" },
            { key: "signout", label: "Sign out", danger: true },
          ] : [{ key: "google", label: "Sign in with Google", disabled: !p.googleAvailable }, { type: "divider" }, { key: "guestend", label: "End guest session", danger: true }],
          onClick: ({ key }) => { if (key === "theme") p.onThemeChange(p.isDark ? "light" : "dark"); if (key === "signout" || key === "guestend") p.endSession(); if (key === "google") p.beginGoogleSignIn(); },
        }}>
          <button className="flex w-full items-center gap-2.5 rounded-lg px-2 py-2 hover:bg-[var(--bg)]">
            <Avatar size={30} src={p.session?.user?.image || undefined}>{p.session?.user?.name?.[0]?.toUpperCase() || "G"}</Avatar>
            {!p.collapsed && <span className="min-w-0 flex-1 text-left"><strong className="block truncate text-[13px]">{p.session?.user?.name || "Guest User"}</strong><small className="block truncate text-[11px] text-[var(--fg-muted)]">{p.session?.user?.email || "Guest Mode"}</small></span>}
          </button>
        </Dropdown>
      </div>
    </aside>
  );
}

function SidebarLink({ icon, label, onClick }: { icon: React.ReactNode; label: string; onClick: () => void }) {
  return <button onClick={onClick} className="flex w-full items-center gap-2.5 rounded-lg px-2 py-1.5 text-[13px] text-[var(--fg-muted)] hover:bg-[var(--bg)] hover:text-[var(--fg)]">{icon}<span className="flex-1 text-left">{label}</span><ChevronRight size={13} className="opacity-50" /></button>;
}

function ChatHeader({ entryMode, active, setMobileOpen, themeMode, onThemeChange, isDark }: {
  entryMode: EntryMode; active: Conversation | null; setMobileOpen: (open: boolean) => void;
  themeMode: "system" | "light" | "dark"; onThemeChange: (mode: "system" | "light" | "dark") => void; isDark: boolean;
}) {
  return <header className="flex h-14 shrink-0 items-center gap-3 border-b border-[var(--border)] bg-[var(--bg-card)] px-4 md:px-6">
    <button className="-ml-2 p-2 md:hidden" onClick={() => setMobileOpen(true)} aria-label="Open navigation"><Menu size={20} /></button>
    <Image src="/icon.png" alt="IIUM AI" width={26} height={22} className="md:hidden" />
    <div className="flex-1 truncate text-sm font-medium">{active?.title ?? ""}</div>
    <Tooltip title={entryMode === "guest" ? "Guest mode" : "Google account"}><span className="hidden items-center gap-1.5 rounded-full border border-[var(--border)] bg-[var(--bg)] px-2.5 py-1 text-[11px] text-[var(--fg-muted)] sm:inline-flex"><ShieldCheck size={12} />{entryMode === "guest" ? "Guest" : "Account"}</span></Tooltip>
    <Select size="small" value={themeMode} onChange={onThemeChange} options={[{ value: "system", label: "System" }, { value: "light", label: "Light" }, { value: "dark", label: "Dark" }]} style={{ width: 100 }} suffixIcon={isDark ? <Moon size={13} /> : <Sun size={13} />} />
  </header>;
}

function MessageList({ active, streaming, copied, error, setError, copyText, regenerate, toggleFeedback, toggleSpeech }: {
  active: Conversation; streaming: boolean; copied: string | null; error: string; setError: (error: string) => void;
  copyText: (content: string, id: string) => void; regenerate: (index: number) => void;
  toggleFeedback: (id: string, value: "up" | "down") => void; toggleSpeech: (content: string) => void;
}) {
  return <div className="min-h-0 flex-1 overflow-y-auto">
    <div className="mx-auto max-w-3xl space-y-6 px-4 py-6">
      {active.messages.map((item, index) => <MessageView key={item.id} message={item} streaming={streaming && index === active.messages.length - 1} copied={copied === item.id} onCopy={() => copyText(item.content, item.id)} onRegenerate={() => regenerate(index)} onFeedback={(value) => toggleFeedback(item.id, value)} onSpeak={() => toggleSpeech(item.content)} />)}
      {error && <div role="alert" className="flex items-start gap-2 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700 dark:border-red-900 dark:bg-red-950/40 dark:text-red-300"><span className="flex-1">{error}</span><button onClick={() => setError("")} aria-label="Dismiss error"><X size={14} /></button></div>}
    </div>
  </div>;
}

function Welcome({ setDraft, textareaRef }: { setDraft: (text: string) => void; textareaRef: RefObject<HTMLTextAreaElement | null> }) {
  return <div className="flex min-h-0 flex-1 items-center justify-center overflow-y-auto px-4 py-8">
    <div className="w-full max-w-3xl animate-fade-up text-center">
      <div className="inline-flex items-center gap-2 text-[11px] tracking-[0.2em] text-[var(--fg-muted)]"><span className="h-px w-8 bg-[var(--border)]" />Designed for thoughtful work<span className="h-px w-8 bg-[var(--border)]" /></div>
      <h1 className="mt-3 text-4xl font-bold leading-tight md:text-5xl">What can I help you<br /><span className="bg-gradient-to-r from-brand-600 to-indigo-500 bg-clip-text text-transparent">with today?</span></h1>
      <p className="mt-4 text-[15px] text-[var(--fg-muted)]">A smart, calm space to ask, create and move ideas forward.</p>
      <div className="mt-8 grid grid-cols-1 gap-3 text-left sm:grid-cols-2 lg:grid-cols-3">
        {suggestions.map(({ title, prompt, icon: Icon }) => <button key={title} onClick={() => { setDraft(prompt); textareaRef.current?.focus(); }} className="group flex items-center gap-3 rounded-xl border border-[var(--border)] bg-[var(--bg-card)] px-4 py-3 transition hover:border-brand-500 hover:shadow-sm"><span className="grid h-8 w-8 place-items-center rounded-lg bg-brand-50 text-brand-600 dark:bg-slate-800"><Icon size={15} /></span><span className="flex-1 text-sm font-medium">{title}</span><ArrowUp size={14} className="-rotate-45 text-[var(--fg-muted)] transition-transform group-hover:rotate-0" /></button>)}
      </div>
    </div>
  </div>;
}

function Composer({ draft, setDraft, files, setFiles, fileRef, textareaRef, addFiles, startVoice, submit, stop, streaming, conversationSyncAvailable }: {
  draft: string; setDraft: (text: string) => void; files: Attachment[]; setFiles: (files: Attachment[] | ((current: Attachment[]) => Attachment[])) => void;
  fileRef: RefObject<HTMLInputElement | null>; textareaRef: RefObject<HTMLTextAreaElement | null>; addFiles: (files: FileList | null) => void;
  startVoice: () => void; submit: () => void; stop: () => void; streaming: boolean; conversationSyncAvailable: boolean;
}) {
  return <div className="shrink-0 border-t border-[var(--border)] bg-[var(--bg-card)]">
    <div className="mx-auto max-w-3xl px-4 py-3">
      {files.length > 0 && <div className="mb-2 flex flex-wrap gap-2">{files.map((file) => <div key={file.id} className="flex max-w-[220px] items-center gap-2 rounded-lg border border-[var(--border)] bg-[var(--bg)] px-2 py-1 text-xs">{file.type.startsWith("image/") ? <Image src={file.url} alt="" width={24} height={24} unoptimized className="h-6 w-6 rounded object-cover" /> : <FileText size={13} />}<span className="truncate">{file.name}</span><button aria-label={`Remove ${file.name}`} onClick={() => { URL.revokeObjectURL(file.url); setFiles((current) => current.filter((item) => item.id !== file.id)); }}><X size={12} /></button></div>)}</div>}
      <div className="rounded-2xl border border-[var(--border)] bg-[var(--bg)] transition focus-within:border-brand-500">
        <textarea ref={textareaRef} value={draft} onChange={(event) => { setDraft(event.target.value); event.target.style.height = "auto"; event.target.style.height = `${Math.min(event.target.scrollHeight, 180)}px`; }} onKeyDown={(event) => { if (event.key === "Enter" && !event.shiftKey && !event.nativeEvent.isComposing) { event.preventDefault(); submit(); } }} rows={1} placeholder="Ask IIUM AI..." aria-label="Message IIUM AI" className="w-full resize-none bg-transparent px-4 pb-1 pt-3 text-[15px] outline-none placeholder:text-[var(--fg-muted)]" />
        <div className="flex items-center justify-between px-2 pb-2">
          <div className="flex items-center gap-1"><input ref={fileRef} type="file" accept="image/*" hidden onChange={(event) => { addFiles(event.target.files); event.currentTarget.value = ""; }} /><Tooltip title="Attach an image"><button className="rounded-lg p-2 text-[var(--fg-muted)] hover:bg-[var(--border)]" onClick={() => fileRef.current?.click()}><ImagePlus size={16} /></button></Tooltip><span className="ml-1 inline-flex items-center gap-1 rounded-md bg-[var(--bg-card)] px-2 py-1 text-[11px] text-[var(--fg-muted)]"><Sparkles size={11} />Gemini</span></div>
          <div className="flex items-center gap-1"><Tooltip title="Voice input"><button className="rounded-lg p-2 text-[var(--fg-muted)] hover:bg-[var(--border)]" onClick={startVoice}><Mic size={16} /></button></Tooltip>{streaming ? <Button type="primary" shape="circle" danger onClick={stop} aria-label="Stop response" className="!h-9 !w-9 !p-0"><span className="block h-2.5 w-2.5 rounded-sm bg-white" /></Button> : <Button type="primary" shape="circle" disabled={!draft.trim() && !files.length} onClick={submit} aria-label="Send message" className="!h-9 !w-9 !p-0"><ArrowUp size={17} /></Button>}</div>
        </div>
      </div>
      <div className="mt-2 flex items-center justify-between text-[11px] text-[var(--fg-muted)]"><span className="inline-flex items-center gap-1"><ShieldCheck size={11} />{conversationSyncAvailable ? "Conversations sync securely" : "Saved in this browser"}</span><span>Enter to send · Shift+Enter for newline</span></div>
    </div>
  </div>;
}
