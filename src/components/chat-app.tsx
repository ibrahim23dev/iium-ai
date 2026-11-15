"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import Image from "next/image";
import Link from "next/link";
import { signIn, signOut, useSession } from "next-auth/react";
import { create } from "zustand";
import {
  Archive, ArrowDown, ArrowLeft, ArrowUp, AudioLines, Check, ChevronDown, ChevronRight,
  CircleHelp, Code2, Copy, FileText, Globe2, ImagePlus, Menu, MessageSquarePlus, Mic, MoreHorizontal,
  Paperclip, PanelLeftClose, PanelLeftOpen, Plus, Search, Settings2, ShieldCheck, Sparkles,
  Sun, Moon, ThumbsDown, ThumbsUp, X,
} from "lucide-react";
import type { Attachment, Conversation, Message, ModelId } from "@/types/chat";
import { CHAT_MODELS, DEFAULT_CHAT_MODEL } from "@/lib/gemini-model";

type Store = { conversations: Conversation[]; activeId: string | null; setConversations: (value: Conversation[] | ((current: Conversation[]) => Conversation[])) => void; setActiveId: (id: string | null) => void };
function loadConversations(): Conversation[] {
  try {
    const saved = localStorage.getItem("iium-ai-conversations");
    if (!saved) return [];
    const parsed: unknown = JSON.parse(saved);
    if (isConversationList(parsed)) return parsed.map((conversation) => ({ ...conversation, model: CHAT_MODELS.some((model) => model.id === conversation.model) ? conversation.model : DEFAULT_CHAT_MODEL }));
  } catch { /* invalid saved data is cleared below */ }
  localStorage.removeItem("iium-ai-conversations");
  return [];
}
const useChatStore = create<Store>((set) => ({ conversations: [], activeId: null, setConversations: (value) => set((state) => ({ conversations: typeof value === "function" ? value(state.conversations) : value })), setActiveId: (activeId) => set({ activeId }) }));
function isConversationList(value: unknown): value is Conversation[] {
  if (!Array.isArray(value)) return false;
  return value.every((entry) => Boolean(entry && typeof entry === "object" && typeof entry.id === "string" && typeof entry.title === "string" && Number.isFinite(entry.updatedAt) && typeof entry.model === "string" && Array.isArray(entry.messages) && entry.messages.every((message: unknown) => Boolean(message && typeof message === "object" && typeof (message as Message).id === "string" && ["user", "assistant"].includes((message as Message).role) && typeof (message as Message).content === "string"))));
}
const suggestions = [
  { title: "Explain something to me", prompt: "Explain a complex idea in simple terms", icon: CircleHelp },
  { title: "Help me write", prompt: "Help me write a clear and engaging piece", icon: FileText },
  { title: "Generate code", prompt: "Help me write and understand some code", icon: Code2 },
  { title: "Analyze a document", prompt: "Help me analyze this document", icon: Search },
  { title: "Research a topic", prompt: "Help me research a topic and organize my findings", icon: Globe2 },
  { title: "Solve a problem", prompt: "Help me think through a problem step by step", icon: Sparkles },
];
const id = () => crypto.randomUUID();
const timestampNow = () => Date.now();
const dateLabel = (timestamp: number) => new Date(timestamp).toLocaleDateString(undefined, { month: "short", day: "numeric" });
async function filesToGeminiImages(attachments?: Attachment[]) {
  const images = await Promise.all((attachments || []).filter((file) => file.type.startsWith("image/")).map(async (file) => {
    const response = await fetch(file.url);
    const blob = await response.blob();
    if (blob.size > 4 * 1024 * 1024) throw new Error(`${file.name} is larger than 4 MB.`);
    const data = await new Promise<string>((resolve, reject) => { const reader = new FileReader(); reader.onload = () => resolve(String(reader.result).split(",")[1] || ""); reader.onerror = () => reject(new Error(`Could not read ${file.name}.`)); reader.readAsDataURL(blob); });
    return { mimeType: blob.type, data };
  }));
  if ((attachments || []).some((file) => !file.type.startsWith("image/"))) throw new Error("This model accepts images. PDF and document attachments are not enabled in the current interface.");
  if (images.length > 1) throw new Error("Attach one image per message for now.");
  return images[0] ? { image: images[0] } : {};
}
function switchLocalHistoryOwner(target: string, retainedOwner?: string) {
  const previous = localStorage.getItem("iium-ai-history-owner");
  if (previous && previous !== target && previous !== retainedOwner) {
    localStorage.removeItem("iium-ai-conversations");
    return true;
  }
  localStorage.setItem("iium-ai-history-owner", target);
  return false;
}

export default function ChatApp() {
  const { data: session, status: authStatus } = useSession();
  const rawConversations = useChatStore((state) => state.conversations);
  const activeId = useChatStore((state) => state.activeId);
  const setConversations = useChatStore((state) => state.setConversations);
  const setActiveId = useChatStore((state) => state.setActiveId);
  const conversations = useMemo(() => Array.isArray(rawConversations) ? rawConversations.filter((item): item is Conversation => Boolean(item && typeof item.id === "string" && Array.isArray(item.messages))) : [], [rawConversations]);
  const hydratedRef = useRef(false);
  const [collapsed, setCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [model, setModel] = useState<ModelId>(() => {
    if (typeof window === "undefined") return DEFAULT_CHAT_MODEL;
    const saved = localStorage.getItem("iium-ai-model");
    return saved && CHAT_MODELS.some((entry) => entry.id === saved) ? saved : DEFAULT_CHAT_MODEL;
  });
  const [modelOpen, setModelOpen] = useState(false);
  const [theme, setTheme] = useState<"light" | "dark" | "system">(() => typeof window === "undefined" ? "system" : (localStorage.getItem("iium-ai-theme") as "light" | "dark" | "system" | null) || "system");
  const [draft, setDraft] = useState("");
  const [files, setFiles] = useState<Attachment[]>([]);
  const [streaming, setStreaming] = useState(false);
  const [error, setError] = useState("");
  const [menuFor, setMenuFor] = useState<string | null>(null);
  const [copied, setCopied] = useState<string | null>(null);
  const [entryMode, setEntryMode] = useState<"checking" | "visitor" | "guest" | "account">("checking");
  const [googleAvailable, setGoogleAvailable] = useState(false);
  const [conversationSyncAvailable, setConversationSyncAvailable] = useState(false);
  const [guestSessionId, setGuestSessionId] = useState<string | null>(null);
  const [cloudPrepared, setCloudPrepared] = useState(false);
  const cloudReady = cloudPrepared || !conversationSyncAvailable || !["guest", "account"].includes(entryMode);
  const [profileOpen, setProfileOpen] = useState(false);
  const abortRef = useRef<AbortController | null>(null);
  const conversationsRef = useRef(conversations);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => { setConversations(loadConversations()); hydratedRef.current = true; }, [setConversations]);
  useEffect(() => { conversationsRef.current = conversations; }, [conversations]);
  useEffect(() => {
    if (authStatus === "loading") return;
    fetch("/api/guest").then((response) => response.json()).then((payload: { mode?: string; googleAvailable?: boolean; conversationSyncAvailable?: boolean; guestSessionId?: string | null }) => {
      setGoogleAvailable(Boolean(payload.googleAvailable)); setConversationSyncAvailable(Boolean(payload.conversationSyncAvailable)); setGuestSessionId(payload.guestSessionId || null);
      if (session?.user?.id) {
        const cleared = switchLocalHistoryOwner(`account:${session.user.id}`, payload.guestSessionId ? `guest:${payload.guestSessionId}` : undefined);
        if (cleared) { setConversations([]); setActiveId(null); }
      } else if (payload.mode === "guest" && payload.guestSessionId) {
        const cleared = switchLocalHistoryOwner(`guest:${payload.guestSessionId}`);
        if (cleared) { setConversations([]); setActiveId(null); }
      }
      setEntryMode(session?.user ? "account" : payload.mode === "guest" ? "guest" : "visitor");
    }).catch(() => setEntryMode(session?.user ? "account" : "visitor"));
  }, [authStatus, session, setActiveId, setConversations]);
  useEffect(() => {
    if (!conversationSyncAvailable || !["guest", "account"].includes(entryMode)) return;
    let cancelled = false;
    const loadCloud = async () => {
      try {
        if (entryMode === "account" && guestSessionId) await fetch("/api/conversations/claim", { method: "POST" });
        const response = await fetch("/api/conversations", { cache: "no-store" });
        if (!response.ok) { if (response.status >= 500) setConversationSyncAvailable(false); return; }
        const payload = await response.json() as { conversations?: Conversation[] };
        if (cancelled || !Array.isArray(payload.conversations)) return;
        const merged = new Map<string, Conversation>();
        for (const item of conversationsRef.current) merged.set(item.id, item);
        for (const item of payload.conversations) if (isConversationList([item])) merged.set(item.id, item);
        const items = [...merged.values()].sort((a, b) => b.updatedAt - a.updatedAt);
        setConversations(items);
        if (items.length) await fetch("/api/conversations", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ conversations: items }) });
      } catch { setConversationSyncAvailable(false); /* Keep the existing browser copy available when cloud storage is temporarily offline. */ }
      finally { if (!cancelled) setCloudPrepared(true); }
    };
    void loadCloud();
    return () => { cancelled = true; };
  }, [conversationSyncAvailable, entryMode, guestSessionId, setConversations]);
  useEffect(() => { if (hydratedRef.current) localStorage.setItem("iium-ai-conversations", JSON.stringify(conversations)); }, [conversations]);
  useEffect(() => {
    if (!conversationSyncAvailable || !cloudReady || !["guest", "account"].includes(entryMode)) return;
    const timer = window.setTimeout(() => { void fetch("/api/conversations", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ conversations }) }); }, 1200);
    return () => window.clearTimeout(timer);
  }, [conversations, conversationSyncAvailable, cloudReady, entryMode]);
  useEffect(() => {
    localStorage.setItem("iium-ai-theme", theme);
    localStorage.setItem("iium-ai-model", model);
    const applyTheme = () => {
      const dark = theme === "dark" || (theme === "system" && window.matchMedia("(prefers-color-scheme: dark)").matches);
      document.documentElement.dataset.theme = dark ? "dark" : "light";
    };
    applyTheme();
    if (theme === "system") {
      const preference = window.matchMedia("(prefers-color-scheme: dark)");
      preference.addEventListener("change", applyTheme);
      return () => preference.removeEventListener("change", applyTheme);
    }
  }, [theme, model]);
  useEffect(() => { const listener = (event: KeyboardEvent) => { if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") { event.preventDefault(); document.getElementById("chat-search")?.focus(); } }; window.addEventListener("keydown", listener); return () => window.removeEventListener("keydown", listener); }, []);

  const active = conversations.find((conversation) => conversation.id === activeId) ?? null;
  const filtered = useMemo(() => conversations.filter((conversation) => conversation.title.toLowerCase().includes(query.toLowerCase())), [conversations, query]);
  const grouped = useMemo(() => {
    const today = new Date().setHours(0, 0, 0, 0);
    return [
      { label: "Today", items: filtered.filter((item) => item.updatedAt >= today) },
      { label: "Previous 7 days", items: filtered.filter((item) => item.updatedAt >= today - 604800000 && item.updatedAt < today) },
      { label: "Previous 30 days", items: filtered.filter((item) => item.updatedAt >= today - 2592000000 && item.updatedAt < today - 604800000) },
      { label: "Older", items: filtered.filter((item) => item.updatedAt < today - 2592000000) },
    ];
  }, [filtered]);

  const newChat = () => { abortRef.current?.abort(); setStreaming(false); setError(""); setDraft(""); setFiles([]); setActiveId(null); setMobileOpen(false); };
  const continueAsGuest = async () => {
    setCloudPrepared(false);
    setEntryMode("checking");
    try { const response = await fetch("/api/guest", { method: "POST" }); if (!response.ok) throw new Error("Guest sessions are temporarily unavailable."); const payload = await response.json() as { guestSessionId?: string; conversationSyncAvailable?: boolean }; if (payload.guestSessionId) { const cleared = switchLocalHistoryOwner(`guest:${payload.guestSessionId}`); if (cleared) { setConversations([]); setActiveId(null); } } setGuestSessionId(payload.guestSessionId || null); setConversationSyncAvailable(Boolean(payload.conversationSyncAvailable)); setEntryMode("guest"); }
    catch (caught) { setError(caught instanceof Error ? caught.message : "Could not start a guest session."); setEntryMode("visitor"); }
  };
  const endCurrentSession = async () => {
    setProfileOpen(false);
    if (session?.user) {
      if (conversationSyncAvailable) await fetch("/api/conversations", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ conversations }) });
      await fetch("/api/guest", { method: "DELETE" });
      await signOut({ redirect: false });
    } else await fetch("/api/guest", { method: "DELETE" });
    localStorage.removeItem("iium-ai-conversations"); localStorage.removeItem("iium-ai-history-owner"); setConversations([]); setActiveId(null);
    setEntryMode("visitor");
  };
  const beginGoogleSignIn = () => { setCloudPrepared(false); void signIn("google", { callbackUrl: "/" }); };
  const updateConversation = useCallback((idValue: string, updater: (conversation: Conversation) => Conversation) => setConversations(conversations.map((item) => item.id === idValue ? updater(item) : item)), [conversations, setConversations]);
  const submit = async (text = draft) => {
    const content = text.trim();
    if ((!content && !files.length) || streaming) return;
    const timestamp = timestampNow();
    let conversation = active;
    if (!conversation) {
      conversation = { id: id(), title: (content || files[0]?.name || "New chat").slice(0, 42), updatedAt: timestamp, model, messages: [] };
      setConversations([conversation, ...conversations]); setActiveId(conversation.id);
    }
    const conversationId = conversation.id;
    const userMessage: Message = { id: id(), role: "user", content, createdAt: timestamp, attachments: files };
    const assistantMessage: Message = { id: id(), role: "assistant", content: "", createdAt: timestamp };
    const currentModel = active ? conversation.model : model;
    const attachments = files;
    setDraft(""); setFiles([]); setError(""); setStreaming(true);
    if (textareaRef.current) textareaRef.current.style.height = "auto";
    setConversations((list) => list.map((item) => item.id === conversationId ? { ...item, model: currentModel, title: item.messages.length === 0 ? (content || attachments[0]?.name || "New chat").slice(0, 42) : item.title, updatedAt: Date.now(), messages: [...item.messages, userMessage, assistantMessage] } : item));
    const controller = new AbortController(); abortRef.current = controller;
    try {
      const requestMessages = await Promise.all([...conversation.messages, userMessage].map(async ({ role, content: messageContent, attachments: messageAttachments }) => ({ role, content: messageContent, ...(role === "user" ? await filesToGeminiImages(messageAttachments) : {}) })));
      const response = await fetch("/api/chat/completions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ conversationId, model: currentModel, messages: requestMessages, stream: true }),
        signal: controller.signal,
      });
      if (!response.ok) {
        const payload = await response.json().catch(() => null) as { error?: { message?: string } } | null;
        throw new Error(payload?.error?.message || `Chat request failed (${response.status}).`);
      }
      if (!response.body) throw new Error("The server returned an empty response stream.");
      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let responseText = "";
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        responseText += decoder.decode(value, { stream: true });
        if (responseText.includes("\n\n[IIUM_ERROR]")) { const [partial, marker] = responseText.split("\n\n[IIUM_ERROR]"); responseText = partial; let message = "Gemini is temporarily unavailable. Please try again."; try { message = JSON.parse(marker); } catch {} throw new Error(message); }
        setConversations((list) => list.map((item) => item.id === conversationId ? { ...item, updatedAt: Date.now(), messages: item.messages.map((message) => message.id === assistantMessage.id ? { ...message, content: responseText } : message) } : item));
      }
      responseText += decoder.decode();
      if (responseText.includes("\n\n[IIUM_ERROR]")) { const [partial, marker] = responseText.split("\n\n[IIUM_ERROR]"); responseText = partial; let message = "Gemini is temporarily unavailable. Please try again."; try { message = JSON.parse(marker); } catch {} throw new Error(message); }
      if (responseText) setConversations((list) => list.map((item) => item.id === conversationId ? { ...item, messages: item.messages.map((message) => message.id === assistantMessage.id ? { ...message, content: responseText } : message) } : item));
      else if (!controller.signal.aborted) throw new Error("The AI returned an empty response. Please try again.");
    } catch (caught) {
      if (!controller.signal.aborted) {
        setError(caught instanceof Error ? caught.message : "Something interrupted this response. Try again.");
        setConversations((list) => list.map((item) => item.id === conversationId ? { ...item, messages: item.messages.filter((message) => message.id !== assistantMessage.id || message.content) } : item));
      }
    }
    finally { setStreaming(false); abortRef.current = null; }
  };
  const stop = () => { abortRef.current?.abort(); setStreaming(false); };
  const regenerate = async (messageIndex: number) => {
    if (!active || streaming) return;
    const previous = active.messages[messageIndex - 1];
    if (!previous || previous.role !== "user") return;
    const withoutResponse = { ...active, messages: active.messages.slice(0, messageIndex - 1) };
    setConversations(conversations.map((item) => item.id === active.id ? withoutResponse : item));
    const timestamp = timestampNow();
    const userMessage: Message = { ...previous, id: id(), createdAt: timestamp };
    const assistantMessage: Message = { id: id(), role: "assistant", content: "", createdAt: timestamp };
    setConversations((list) => list.map((item) => item.id === active.id ? { ...item, messages: [...item.messages, userMessage, assistantMessage] } : item));
    setStreaming(true); setError("");
    const controller = new AbortController(); abortRef.current = controller;
    let responseText = "";
    try {
      const requestMessages = await Promise.all([...withoutResponse.messages, userMessage].map(async ({ role, content, attachments }) => ({ role, content, ...(role === "user" ? await filesToGeminiImages(attachments) : {}) })));
      const response = await fetch("/api/chat/completions", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ conversationId: active.id, model: active.model, messages: requestMessages, stream: true }), signal: controller.signal });
      if (!response.ok) { const payload = await response.json().catch(() => null) as { error?: { message?: string } } | null; throw new Error(payload?.error?.message || `Chat request failed (${response.status}).`); }
      if (!response.body) throw new Error("The server returned an empty response stream.");
      const reader = response.body.getReader(); const decoder = new TextDecoder();
      while (true) { const { done, value } = await reader.read(); if (done) break; responseText += decoder.decode(value, { stream: true }); if (responseText.includes("\n\n[IIUM_ERROR]")) { const [partial, marker] = responseText.split("\n\n[IIUM_ERROR]"); responseText = partial; let message = "Gemini is temporarily unavailable. Please try again."; try { message = JSON.parse(marker); } catch {} throw new Error(message); } setConversations((list) => list.map((item) => item.id === active.id ? { ...item, messages: item.messages.map((message) => message.id === assistantMessage.id ? { ...message, content: responseText } : message) } : item)); }
      responseText += decoder.decode();
    } catch (caught) {
      if (!controller.signal.aborted) { setError(caught instanceof Error ? caught.message : "Could not regenerate the response."); setConversations((list) => list.map((item) => item.id === active.id ? { ...item, messages: item.messages.filter((message) => message.id !== assistantMessage.id || message.content) } : item)); }
    } finally { setStreaming(false); abortRef.current = null; }
  };
  const addFiles = (fileList: FileList | null) => {
    if (!fileList) return;
    const added = Array.from(fileList).map((file) => ({ id: id(), name: file.name, type: file.type, url: URL.createObjectURL(file), size: file.size }));
    setFiles((current) => [...current, ...added]);
  };
  const copyText = async (text: string, key: string) => { await navigator.clipboard.writeText(text); setCopied(key); window.setTimeout(() => setCopied(null), 1500); };
  const deleteChat = (chatId: string) => { setConversations(conversations.filter((item) => item.id !== chatId)); if (conversationSyncAvailable) void fetch(`/api/conversations/${encodeURIComponent(chatId)}`, { method: "DELETE" }); if (activeId === chatId) setActiveId(null); setMenuFor(null); };
  const renameChat = (chat: Conversation) => { const title = window.prompt("Rename conversation", chat.title); if (title?.trim()) updateConversation(chat.id, (item) => ({ ...item, title: title.trim() })); setMenuFor(null); };
  const toggleFeedback = (messageId: string, feedback: "up" | "down") => { if (!active) return; updateConversation(active.id, (item) => ({ ...item, messages: item.messages.map((message) => message.id === messageId ? { ...message, feedback: message.feedback === feedback ? undefined : feedback } : message) })); };
  const toggleSpeech = (text: string) => { if (!window.speechSynthesis) return; window.speechSynthesis.cancel(); const utterance = new SpeechSynthesisUtterance(text); window.speechSynthesis.speak(utterance); };
  type SpeechResultEvent = Event & { results: ArrayLike<ArrayLike<{ transcript: string }>> };
  type SpeechRecognizer = { lang: string; onresult: ((event: SpeechResultEvent) => void) | null; onerror: (() => void) | null; start: () => void };
  const startVoice = () => {
    const SpeechRecognition = (window as Window & { SpeechRecognition?: new () => SpeechRecognizer; webkitSpeechRecognition?: new () => SpeechRecognizer }).SpeechRecognition || (window as Window & { webkitSpeechRecognition?: new () => SpeechRecognizer }).webkitSpeechRecognition;
    if (!SpeechRecognition) { setError("Voice input is not supported in this browser."); return; }
    const recognition = new SpeechRecognition(); recognition.lang = navigator.language; recognition.onresult = (event) => setDraft((value) => `${value}${value ? " " : ""}${event.results[0][0].transcript}`); recognition.onerror = () => setError("Could not capture your voice. Please try again."); recognition.start();
  };
  const activeChatModel = active?.model ?? model;
  const selectedModelLabel = CHAT_MODELS.find((entry) => entry.id === activeChatModel)?.label || "IIUM AI – Gemini Free";
  const currentEntryMode = session?.user && authStatus === "authenticated" ? "account" : entryMode;

  if (currentEntryMode === "checking" || authStatus === "loading") return <main className="auth-loading"><Image src="/icon.png" alt="IIUM AI" width={52} height={44} priority /><span>Preparing your workspace…</span></main>;
  if (currentEntryMode === "visitor") return <main className="auth-welcome"><section className="auth-welcome-card"><Image src="/icon.png" alt="IIUM AI logo" width={82} height={68} priority className="auth-logo" /><div className="auth-kicker">YOUR INTELLIGENT AI WORKSPACE</div><h1>Welcome to IIUM AI</h1><p>Your intelligent AI workspace. Ask questions, explore ideas, and get things done.</p><button className="google-signin-button" disabled={!googleAvailable} title={!googleAvailable ? "Google sign-in needs OAuth credentials and a database connection." : undefined} onClick={beginGoogleSignIn}><GoogleMark />Continue with Google</button>{!googleAvailable && <p className="auth-setup-note">Google sign-in will be available after the app owner configures OAuth and the database.</p>}<button className="guest-button" onClick={() => void continueAsGuest()}>Continue as Guest</button><div className="auth-divider"><span />or<span /></div><p className="guest-note">No account needed. Guest conversations stay in this browser for up to 30 days.</p>{error && <div className="inline-error">{error}<button onClick={() => setError("")}><X size={14} /></button></div>}<div className="auth-footer">By continuing, you agree to use IIUM AI responsibly.</div></section></main>;

  return <div className="app-shell">
    <aside className={`sidebar ${collapsed ? "sidebar-collapsed" : ""} ${mobileOpen ? "sidebar-mobile-open" : ""}`}>
      <div className="sidebar-top">
        <a className="brand" href="#" onClick={(event) => { event.preventDefault(); newChat(); }} aria-label="IIUM AI home"><span className="brand-mark"><Image src="/icon.png" alt="" width={34} height={28} priority /></span>{!collapsed && <span className="brand-copy"><strong>IIUM AI</strong><small>Think smarter. Create more.</small></span>}</a>
        <button className="icon-button collapse-button" aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"} onClick={() => setCollapsed(!collapsed)}>{collapsed ? <PanelLeftOpen size={18} /> : <PanelLeftClose size={18} />}</button>
      </div>
      <div className="sidebar-actions">
        <button className="new-chat-button" onClick={newChat} title={collapsed ? "New chat" : undefined}><Plus size={17} /><span>New chat</span><kbd>⌘ K</kbd></button>
        <label className="search-box"><Search size={16} /><input id="chat-search" placeholder="Search conversations" value={query} onChange={(event) => setQuery(event.target.value)} /><kbd>⌘ K</kbd></label>
      </div>
      <nav className="history-nav" aria-label="Conversation history">
        {!collapsed && <div className="history-heading">YOUR SPACE</div>}
        {!collapsed && <button className="nav-row" onClick={() => setError("Projects are coming soon.")}><Archive size={16} /><span>Projects</span><ChevronRight size={14} className="nav-chevron" /></button>}
        {!collapsed && <button className="nav-row" onClick={() => setError("AI tools are coming soon.")}><Sparkles size={16} /><span>Explore AI tools</span><ChevronRight size={14} className="nav-chevron" /></button>}
        {!collapsed && <div className="history-heading history-list-heading">RECENT CHATS</div>}
        {!collapsed && grouped.map((group) => group.items.length > 0 && <div className="history-group" key={group.label}><div className="group-label">{group.label}</div>{group.items.map((chat) => <div className={`history-item-wrap ${activeId === chat.id ? "selected" : ""}`} key={chat.id}><button className="history-item" onClick={() => { setActiveId(chat.id); setMobileOpen(false); }} title={chat.title}><MessageCircleIcon /><span>{chat.title}</span></button><button className="history-more" aria-label={`Options for ${chat.title}`} onClick={() => setMenuFor(menuFor === chat.id ? null : chat.id)}><MoreHorizontal size={16} /></button>{menuFor === chat.id && <div className="history-menu"><button onClick={() => renameChat(chat)}>Rename</button><button className="danger-action" onClick={() => deleteChat(chat.id)}>Delete</button></div>}</div>)}</div>)}
        {!collapsed && grouped.every((group) => group.items.length === 0) && <p className="empty-history">{query ? "No matching chats" : "Your conversations will appear here"}</p>}
      </nav>
      <div className="sidebar-footer">
        <Link className="nav-row" href="/profile" title={collapsed ? "Settings" : undefined}><Settings2 size={17} /><span>Settings</span></Link>
        <div className="profile-menu-wrap"><button className="profile-button" title="Account profile" aria-expanded={profileOpen} onClick={() => setProfileOpen(!profileOpen)}>{session?.user?.image ? <Image className="avatar avatar-image" src={session.user.image} alt="" width={30} height={30} unoptimized /> : <span className="avatar">{session?.user?.name?.[0]?.toUpperCase() || "G"}</span>}<span className="profile-copy"><strong>{session?.user?.name || "Guest User"}</strong><small>{session?.user?.email || "Guest Mode"}</small></span><MoreHorizontal size={17} className="profile-more" /></button>{profileOpen && <div className="profile-dropdown">{session?.user ? <><div className="profile-dropdown-heading"><strong>{session.user.name}</strong><small>{session.user.email}</small></div><Link href="/profile" onClick={() => setProfileOpen(false)}>My Profile &amp; settings</Link><Link href="/profile#data-privacy" onClick={() => setProfileOpen(false)}>Data &amp; Privacy</Link><button onClick={() => { setTheme(theme === "light" ? "dark" : "light"); setProfileOpen(false); }}>Switch to {theme === "dark" ? "light" : "dark"} appearance</button><a href="mailto:support@iium.ai">Help & support</a><button className="profile-signout" onClick={() => void endCurrentSession()}>Sign out</button></> : <><div className="profile-dropdown-heading"><strong>Guest Mode</strong><small>This browser only</small></div><button disabled={!googleAvailable} title={!googleAvailable ? "Google OAuth is not configured yet." : undefined} onClick={beginGoogleSignIn}>Sign in with Google</button><button className="profile-signout" onClick={() => void endCurrentSession()}>End guest session</button></>}</div>}</div>
      </div>
    </aside>
    {mobileOpen && <button className="mobile-backdrop" aria-label="Close navigation" onClick={() => setMobileOpen(false)} />}
    <main className="main-panel">
      <header className="topbar"><button className="icon-button mobile-menu-button" aria-label="Open navigation" onClick={() => setMobileOpen(true)}><Menu size={20} /></button><Image className="topbar-logo" src="/icon.png" alt="IIUM AI" width={29} height={24} />{active ? <div className="topbar-title">{active.title}</div> : <div className="topbar-spacer" />}<div className="topbar-actions"><span className="private-indicator"><ShieldCheck size={14} /> {entryMode === "guest" ? "Guest Mode" : "Google account"}</span><div className="theme-control" aria-label="Theme"><button onClick={() => setTheme(theme === "light" ? "dark" : "light")} title={`Theme: ${theme}. Click to switch between light and dark`} className="icon-button">{theme === "dark" ? <Moon size={17} /> : <Sun size={17} />}</button><select aria-label="Theme preference" value={theme} onChange={(event) => setTheme(event.target.value as typeof theme)}><option value="system">System</option><option value="light">Light</option><option value="dark">Dark</option></select></div></div></header>
      <section className={`conversation ${active ? "has-messages" : "welcome-view"}`}>
        {active ? <div className="messages-area">{active.messages.map((message, index) => <MessageView key={message.id} message={message} index={index} streaming={streaming && index === active.messages.length - 1} copied={copied === message.id} onCopy={() => copyText(message.content, message.id)} onRegenerate={() => regenerate(index)} onFeedback={(value) => toggleFeedback(message.id, value)} onSpeak={() => toggleSpeech(message.content)} />)}{streaming && active.messages.at(-1)?.content === "" && <div className="typing-indicator"><span /><span /><span /></div>}{error && <div className="inline-error">{error}<button onClick={() => setError("")}><X size={14} /></button></div>}</div> : <div className="welcome-content"><div className="welcome-kicker"><span className="kicker-line" /> A calmer space to think <span className="kicker-line" /></div><h1>What can I help you<br /><span>with today?</span></h1><p className="welcome-subtitle">Ask anything. Explore ideas. Get things done.</p><div className="suggestion-grid">{suggestions.map(({ title, prompt, icon: Icon }) => <button className="suggestion-card" key={title} onClick={() => { setDraft(prompt); textareaRef.current?.focus(); }}><span className="suggestion-icon"><Icon size={17} strokeWidth={1.8} /></span><span>{title}</span><ArrowUp size={15} className="suggestion-arrow" /></button>)}</div>{error && <div className="inline-error">{error}<button onClick={() => setError("")}><X size={14} /></button></div>}</div>}
        <div className="composer-wrap">
          {files.length > 0 && <div className="attachment-list">{files.map((file) => <div className="attachment-chip" key={file.id}>{file.type.startsWith("image/") ? <img src={file.url} alt={file.name} /> : <FileText size={16} />}<span>{file.name}</span><button aria-label={`Remove ${file.name}`} onClick={() => { URL.revokeObjectURL(file.url); setFiles(files.filter((item) => item.id !== file.id)); }}><X size={13} /></button></div>)}</div>}
          <div className="composer"><textarea ref={textareaRef} value={draft} onChange={(event) => { setDraft(event.target.value); event.target.style.height = "auto"; event.target.style.height = `${Math.min(event.target.scrollHeight, 180)}px`; }} onKeyDown={(event) => { if (event.key === "Enter" && !event.shiftKey && !event.nativeEvent.isComposing) { event.preventDefault(); void submit(); } }} placeholder="Message IIUM AI..." rows={1} aria-label="Message IIUM AI" /><div className="composer-toolbar"><div className="composer-tools"><input ref={fileRef} type="file" multiple hidden onChange={(event) => { addFiles(event.target.files); event.currentTarget.value = ""; }} /><button className="tool-button" onClick={() => { if (fileRef.current) fileRef.current.accept = ""; fileRef.current?.click(); }} aria-label="Attach files"><Paperclip size={17} /><span>Attach</span></button><button className="tool-button" onClick={() => { if (fileRef.current) fileRef.current.accept = "image/*"; fileRef.current?.click(); }} aria-label="Attach image"><ImagePlus size={17} /><span>Image</span></button><div className="model-select-wrap"><button className="model-select" onClick={() => setModelOpen(!modelOpen)} aria-expanded={modelOpen}><span className="model-spark"><Sparkles size={13} /></span>{selectedModelLabel}<ChevronDown size={14} /></button>{modelOpen && <div className="model-menu"><div className="model-category-label">CHAT MODELS</div>{CHAT_MODELS.map((entry) => <button key={entry.id} onClick={() => { setModel(entry.id); setModelOpen(false); if (active) updateConversation(active.id, (chat) => ({ ...chat, model: entry.id })); }}><span>{entry.label}<small>{entry.note}</small></span><em className="model-price free">{entry.price}</em>{activeChatModel === entry.id && <Check size={15} />}</button>)}</div>}</div></div><div className="composer-submit"><button className="voice-button" onClick={startVoice} aria-label="Voice input" title="Voice input"><Mic size={17} /></button>{streaming ? <button className="send-button stop-button" aria-label="Stop generation" onClick={stop}><span className="stop-square" /></button> : <button className="send-button" aria-label="Send message" title="Send message" onClick={() => void submit()} disabled={!draft.trim() && !files.length}><ArrowUp size={19} strokeWidth={2.2} /></button>}</div></div></div>
          <div className="composer-note"><span><ShieldCheck size={12} /> Your conversations stay in this browser</span><span>Enter to send <i>·</i> Shift + Enter for a new line</span></div>
        </div>
      </section>
      <footer className="page-footer"><span>IIUM AI <i>·</i> A thoughtful space to create</span><button onClick={() => setError("Help center is coming soon.")}>Help & feedback <ArrowDown size={12} className="footer-arrow" /></button></footer>
    </main>
  </div>;
}

function MessageCircleIcon() { return <span className="history-message-icon"><MessageSquarePlus size={15} /></span>; }
function GoogleMark() { return <svg aria-hidden="true" viewBox="0 0 48 48" width="19" height="19"><path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5Z"/><path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.91c-.58 2.96-2.26 5.47-4.74 7.18l7.72 5.99c4.51-4.17 7.09-10.32 7.09-17.64Z"/><path fill="#FBBC05" d="M10.53 28.59a14.4 14.4 0 0 1 0-9.18l-7.98-6.19a23.92 23.92 0 0 0 0 21.56l7.98-6.19Z"/><path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.72-5.99c-2.14 1.44-4.88 2.3-8.17 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48Z"/></svg>; }

type MessageViewProps = { message: Message; index: number; streaming: boolean; copied: boolean; onCopy: () => void; onRegenerate: () => void; onFeedback: (value: "up" | "down") => void; onSpeak: () => void };
function MessageView({ message, streaming, copied, onCopy, onRegenerate, onFeedback, onSpeak }: MessageViewProps) {
  const [speaking, setSpeaking] = useState(false);
  const audioAction = () => { onSpeak(); setSpeaking(true); window.setTimeout(() => setSpeaking(false), 2400); };
  return <article className={`message message-${message.role}`}>
    {message.role === "assistant" && <div className="assistant-avatar"><Image src="/icon.png" alt="IIUM AI" width={23} height={19} /></div>}
    <div className="message-body">{message.role === "user" ? <><div className="user-bubble">{message.content && <p>{message.content}</p>}{message.attachments?.length ? <div className="message-attachments">{message.attachments.map((file) => file.type.startsWith("image/") ? <img key={file.id} src={file.url} alt={file.name} /> : <span key={file.id}><FileText size={14} />{file.name}</span>)}</div> : null}</div><div className="message-time">{dateLabel(message.createdAt)}</div></> : <><div className="assistant-content">{message.content ? <ReactMarkdown remarkPlugins={[remarkGfm]} components={{ code({ className, children, ...props }) { const inline = !className; return inline ? <code className="inline-code" {...props}>{children}</code> : <CodeBlock code={String(children).replace(/\n$/, "")} language={className?.replace("language-", "") || "text"} />; }, table({ children }) { return <div className="table-scroll"><table>{children}</table></div>; } }}>{message.content}</ReactMarkdown> : <span className="typing-indicator"><span /><span /><span /></span>}</div>{message.attachments?.some((file) => file.type.startsWith("image/")) && <div className="generated-images">{message.attachments.filter((file) => file.type.startsWith("image/")).map((file) => <img key={file.id} src={file.url} alt={file.name} />)}</div>}{!streaming && message.content && <div className="message-actions"><button onClick={onCopy} title="Copy response">{copied ? <Check size={14} /> : <Copy size={14} />}<span>{copied ? "Copied" : "Copy"}</span></button><button onClick={onRegenerate} title="Regenerate response"><ArrowLeft size={14} /><span>Regenerate</span></button><button className={message.feedback === "up" ? "feedback-active" : ""} onClick={() => onFeedback("up")} title="Good response"><ThumbsUp size={14} /></button><button className={message.feedback === "down" ? "feedback-active" : ""} onClick={() => onFeedback("down")} title="Poor response"><ThumbsDown size={14} /></button><button className={speaking ? "feedback-active" : ""} onClick={audioAction} title="Read aloud"><AudioLines size={14} /></button></div>}</>}</div>
  </article>;
}

function CodeBlock({ code, language }: { code: string; language: string }) {
  const [copied, setCopied] = useState(false);
  return <div className="code-block"><div className="code-header"><span>{language}</span><button onClick={async () => { await navigator.clipboard.writeText(code); setCopied(true); window.setTimeout(() => setCopied(false), 1500); }}>{copied ? <Check size={13} /> : <Copy size={13} />}{copied ? "Copied" : "Copy code"}</button></div><pre><code>{code}</code></pre></div>;
}
