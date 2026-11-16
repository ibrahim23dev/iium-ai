"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { signIn, signOut, useSession } from "next-auth/react";
import { App as AntApp, Input } from "antd";
import type { Attachment, Conversation, Message, ModelId } from "@/types/chat";
import { CHAT_MODELS, DEFAULT_CHAT_MODEL } from "@/lib/gemini-model";
import { useTheme } from "@/app/providers";
import { createId, isConversationList, loadConversations, switchOwner, timestampNow, useChatStore } from "./chat/chat-utils";
import { ChatWorkspace } from "./chat/chat-workspace";
import { AuthWelcome } from "./chat/auth-welcome";
import { requestCompletion } from "./chat/request-completion";

export default function ChatApp() {
  const { message, modal } = AntApp.useApp();
  const { data: session, status: authStatus } = useSession();
  const { setMode: setThemeMode } = useTheme();

  const rawConversations = useChatStore((s) => s.conversations);
  const activeId = useChatStore((s) => s.activeId);
  const setConversations = useChatStore((s) => s.setConversations);
  const setActiveId = useChatStore((s) => s.setActiveId);

  const conversations = useMemo(
    () => (Array.isArray(rawConversations) ? rawConversations.filter((i): i is Conversation => Boolean(i && typeof i.id === "string" && Array.isArray(i.messages))) : []),
    [rawConversations]
  );

  const hydratedRef = useRef(false);
  const [collapsed, setCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [model] = useState<ModelId>(() => {
    if (typeof window === "undefined") return DEFAULT_CHAT_MODEL;
    const saved = localStorage.getItem("iium-ai-model");
    return saved && CHAT_MODELS.some((e) => e.id === saved) ? saved : DEFAULT_CHAT_MODEL;
  });
  const [draft, setDraft] = useState("");
  const [files, setFiles] = useState<Attachment[]>([]);
  const [streaming, setStreaming] = useState(false);
  const [error, setError] = useState("");
  const [copied, setCopied] = useState<string | null>(null);
  const [entryMode, setEntryMode] = useState<"checking" | "visitor" | "guest" | "account">("checking");
  const [googleAvailable, setGoogleAvailable] = useState(false);
  const [googleUnavailableReason, setGoogleUnavailableReason] = useState("");
  const [manualAuthAvailable, setManualAuthAvailable] = useState(false);
  const [conversationSyncAvailable, setConversationSyncAvailable] = useState(false);
  const [guestSessionId, setGuestSessionId] = useState<string | null>(null);
  const [cloudPrepared, setCloudPrepared] = useState(false);
  const cloudReady = cloudPrepared || !conversationSyncAvailable || !["guest", "account"].includes(entryMode);

  const abortRef = useRef<AbortController | null>(null);
  const conversationsRef = useRef(conversations);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => { setConversations(loadConversations()); hydratedRef.current = true; }, [setConversations]);
  useEffect(() => { conversationsRef.current = conversations; }, [conversations]);

  /* --- bootstrap session --- */
  useEffect(() => {
    fetch("/api/guest")
      .then((r) => r.json())
      .then((payload: { mode?: string; googleAvailable?: boolean; googleUnavailableReason?: string | null; manualAuthAvailable?: boolean; conversationSyncAvailable?: boolean; guestSessionId?: string | null }) => {
        setGoogleAvailable(Boolean(payload.googleAvailable));
        setGoogleUnavailableReason(payload.googleUnavailableReason || "");
        setManualAuthAvailable(Boolean(payload.manualAuthAvailable));
        setConversationSyncAvailable(Boolean(payload.conversationSyncAvailable));
        setGuestSessionId(payload.guestSessionId || null);
        if (session?.user?.id) {
          const cleared = switchOwner(`account:${session.user.id}`, payload.guestSessionId ? `guest:${payload.guestSessionId}` : undefined);
          if (cleared) { setConversations([]); setActiveId(null); }
        } else if (payload.mode === "guest" && payload.guestSessionId) {
          const cleared = switchOwner(`guest:${payload.guestSessionId}`);
          if (cleared) { setConversations([]); setActiveId(null); }
        }
        setEntryMode(session?.user || payload.mode === "account" ? "account" : payload.mode === "guest" ? "guest" : "visitor");
      })
      .catch(() => setEntryMode(session?.user ? "account" : "visitor"));
  }, [session, setActiveId, setConversations]);

  /* --- load cloud history --- */
  useEffect(() => {
    if (!conversationSyncAvailable || !["guest", "account"].includes(entryMode)) return;
    let cancelled = false;
    (async () => {
      try {
        if (entryMode === "account" && guestSessionId) await fetch("/api/conversations/claim", { method: "POST" });
        const res = await fetch("/api/conversations", { cache: "no-store" });
        if (!res.ok) { if (res.status >= 500) setConversationSyncAvailable(false); return; }
        const { conversations: cloud } = (await res.json()) as { conversations?: Conversation[] };
        if (cancelled || !Array.isArray(cloud)) return;
        const merged = new Map<string, Conversation>();
        for (const c of conversationsRef.current) merged.set(c.id, c);
        for (const c of cloud) {
          if (!isConversationList([c])) continue;
          const local = merged.get(c.id);
          if (!local || c.updatedAt > local.updatedAt) merged.set(c.id, c);
        }
        const items = [...merged.values()].sort((a, b) => b.updatedAt - a.updatedAt);
        setConversations(items);
        if (items.length) {
          await fetch("/api/conversations", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ conversations: items }) });
        }
      } catch { setConversationSyncAvailable(false); }
      finally { if (!cancelled) setCloudPrepared(true); }
    })();
    return () => { cancelled = true; };
  }, [conversationSyncAvailable, entryMode, guestSessionId, setConversations]);

  /* --- persist local --- */
  useEffect(() => {
    if (!hydratedRef.current) return;
    try { localStorage.setItem("iium-ai-conversations", JSON.stringify(conversations)); }
    catch { message.warning("Browser storage is full. Older local conversations may not be saved."); }
  }, [conversations, message]);

  /* --- debounced cloud PUT --- */
  useEffect(() => {
    if (!conversationSyncAvailable || !cloudReady || !["guest", "account"].includes(entryMode)) return;
    const t = setTimeout(() => {
      void fetch("/api/conversations", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ conversations }) })
        .then((response) => { if (!response.ok) setConversationSyncAvailable(false); })
        .catch(() => setConversationSyncAvailable(false));
    }, 1200);
    return () => clearTimeout(t);
  }, [conversations, conversationSyncAvailable, cloudReady, entryMode]);

  /* --- Cmd/Ctrl+K search --- */
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        document.getElementById("chat-search")?.focus();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const active = conversations.find((c) => c.id === activeId) ?? null;
  const filtered = useMemo(() => conversations.filter((c) => c.title.toLowerCase().includes(query.toLowerCase())), [conversations, query]);
  const grouped = useMemo(() => {
    const today = new Date().setHours(0, 0, 0, 0);
    return [
      { label: "Today", items: filtered.filter((i) => i.updatedAt >= today) },
      { label: "Previous 7 days", items: filtered.filter((i) => i.updatedAt >= today - 604800000 && i.updatedAt < today) },
      { label: "Previous 30 days", items: filtered.filter((i) => i.updatedAt >= today - 2592000000 && i.updatedAt < today - 604800000) },
      { label: "Older", items: filtered.filter((i) => i.updatedAt < today - 2592000000) },
    ];
  }, [filtered]);

  /* --- actions --- */
  const newChat = () => { abortRef.current?.abort(); setStreaming(false); setError(""); setDraft(""); setFiles([]); setActiveId(null); setMobileOpen(false); };

  const continueAsGuest = async () => {
    setCloudPrepared(false);
    setEntryMode("checking");
    try {
      const res = await fetch("/api/guest", { method: "POST" });
      if (!res.ok) throw new Error("Guest sessions are temporarily unavailable.");
      const payload = (await res.json()) as { guestSessionId?: string; conversationSyncAvailable?: boolean };
      if (payload.guestSessionId) {
        const cleared = switchOwner(`guest:${payload.guestSessionId}`);
        if (cleared) { setConversations([]); setActiveId(null); }
      }
      setGuestSessionId(payload.guestSessionId || null);
      setConversationSyncAvailable(Boolean(payload.conversationSyncAvailable));
      setEntryMode("guest");
    } catch (e) {
      message.error(e instanceof Error ? e.message : "Could not start a guest session.");
      setEntryMode("visitor");
    }
  };

  const endSession = async () => {
    if (session?.user) {
      if (conversationSyncAvailable) {
        await fetch("/api/conversations", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ conversations }) });
      }
      await fetch("/api/guest", { method: "DELETE" });
      await signOut({ redirect: false });
    } else await fetch("/api/guest", { method: "DELETE" });
    localStorage.removeItem("iium-ai-conversations");
    localStorage.removeItem("iium-ai-history-owner");
    setConversations([]); setActiveId(null); setEntryMode("visitor");
  };

  const beginGoogleSignIn = async () => {
    setCloudPrepared(false);
    try {
      const result = await signIn("google", { redirect: false, redirectTo: "/" });
      if (result?.error) {
        message.error(`Google sign-in could not start (${result.error}). Check the OAuth client configuration.`);
        return;
      }
      if (result?.url) window.location.assign(result.url);
      else message.error("Google sign-in did not return a redirect URL. Check the NextAuth server logs.");
    } catch {
      message.error("Google sign-in could not start. Check the server logs and Google OAuth redirect URI.");
    }
  };

  const updateConversation = useCallback(
    (cid: string, updater: (c: Conversation) => Conversation) => setConversations((current) => current.map((item) => item.id === cid ? updater(item) : item)),
    [setConversations]
  );

  const submit = async (text = draft) => {
    const content = text.trim();
    if ((!content && !files.length) || streaming) return;
    const ts = timestampNow();
    let conversation = active;
    if (!conversation) {
      conversation = { id: createId(), title: (content || files[0]?.name || "New chat").slice(0, 42), updatedAt: ts, model, messages: [] };
      setConversations([conversation, ...conversations]);
      setActiveId(conversation.id);
    }
    const cid = conversation.id;
    const userMsg: Message = { id: createId(), role: "user", content, createdAt: ts, attachments: files };
    const assistantMsg: Message = { id: createId(), role: "assistant", content: "", createdAt: ts };
    const attachments = files;
    const currentModel = active ? conversation.model : model;

    setDraft(""); setFiles([]); setError(""); setStreaming(true);
    if (textareaRef.current) textareaRef.current.style.height = "auto";

    setConversations((list) =>
      list.map((i) => i.id === cid ? {
        ...i, model: currentModel,
        title: i.messages.length === 0 ? (content || attachments[0]?.name || "New chat").slice(0, 42) : i.title,
        updatedAt: Date.now(),
        messages: [...i.messages, userMsg, assistantMsg],
      } : i)
    );

    const ctrl = new AbortController();
    abortRef.current = ctrl;
    try {
      await requestCompletion({
        messages: [...conversation.messages, userMsg],
        model: currentModel,
        signal: ctrl.signal,
        onText: (text) => setConversations((list) => list.map((item) => item.id === cid ? {
          ...item,
          updatedAt: Date.now(),
          messages: item.messages.map((entry) => entry.id === assistantMsg.id ? { ...entry, content: text } : entry),
        } : item)),
      });
    } catch (e) {
      if (!ctrl.signal.aborted) {
        setError(e instanceof Error ? e.message : "Something interrupted this response.");
        setConversations((list) =>
          list.map((i) => i.id === cid ? { ...i, messages: i.messages.filter((mm) => mm.id !== assistantMsg.id || mm.content) } : i)
        );
      }
    } finally { setStreaming(false); abortRef.current = null; }
  };

  const stop = () => { abortRef.current?.abort(); setStreaming(false); };

  const regenerate = async (messageIndex: number) => {
    if (!active || streaming) return;
    const prev = active.messages[messageIndex - 1];
    if (!prev || prev.role !== "user") return;
    const withoutResponse = { ...active, messages: active.messages.slice(0, messageIndex - 1) };
    setConversations(conversations.map((i) => (i.id === active.id ? withoutResponse : i)));
    const ts = timestampNow();
    const userMsg: Message = { ...prev, id: createId(), createdAt: ts };
    const assistantMsg: Message = { id: createId(), role: "assistant", content: "", createdAt: ts };
    setConversations((list) => list.map((i) => (i.id === active.id ? { ...i, messages: [...i.messages, userMsg, assistantMsg] } : i)));
    setStreaming(true); setError("");
    const ctrl = new AbortController();
    abortRef.current = ctrl;
    try {
      await requestCompletion({
        messages: [...withoutResponse.messages, userMsg],
        model: active.model,
        signal: ctrl.signal,
        onText: (text) => setConversations((list) => list.map((item) => item.id === active.id ? {
          ...item,
          messages: item.messages.map((entry) => entry.id === assistantMsg.id ? { ...entry, content: text } : entry),
        } : item)),
      });
    } catch (e) {
      if (!ctrl.signal.aborted) {
        setError(e instanceof Error ? e.message : "Could not regenerate.");
        setConversations((list) => list.map((i) => i.id === active.id ? { ...i, messages: i.messages.filter((mm) => mm.id !== assistantMsg.id || mm.content) } : i));
      }
    } finally { setStreaming(false); abortRef.current = null; }
  };

  const addFiles = (list: FileList | null) => {
    if (!list) return;
    const added = Array.from(list).map((f) => ({ id: createId(), name: f.name, type: f.type, url: URL.createObjectURL(f), size: f.size }));
    setFiles((cur) => [...cur, ...added]);
  };

  const copyText = async (text: string, key: string) => {
    await navigator.clipboard.writeText(text);
    setCopied(key);
    message.success("Copied");
    setTimeout(() => setCopied(null), 1500);
  };

  const deleteChat = (cid: string) => {
    modal.confirm({
      title: "Delete this chat?",
      content: "This action cannot be undone.",
      okText: "Delete", okButtonProps: { danger: true }, cancelText: "Cancel",
      onOk: () => {
        setConversations((current) => current.filter((item) => item.id !== cid));
        if (conversationSyncAvailable) void fetch(`/api/conversations/${encodeURIComponent(cid)}`, { method: "DELETE" });
        if (activeId === cid) setActiveId(null);
      },
    });
  };

  const renameChat = (chat: Conversation) => {
    let next = chat.title;
    modal.confirm({
      title: "Rename conversation",
      icon: null,
      content: <Input defaultValue={chat.title} onChange={(e) => { next = e.target.value; }} onPressEnter={() => { if (next.trim()) updateConversation(chat.id, (i) => ({ ...i, title: next.trim() })); }} />,
      okText: "Save", cancelText: "Cancel",
      onOk: () => { if (next.trim()) updateConversation(chat.id, (i) => ({ ...i, title: next.trim() })); },
    });
  };

  const toggleFeedback = (mid: string, fb: "up" | "down") => {
    if (!active) return;
    updateConversation(active.id, (i) => ({ ...i, messages: i.messages.map((m) => (m.id === mid ? { ...m, feedback: m.feedback === fb ? undefined : fb } : m)) }));
  };

  const toggleSpeech = (text: string) => {
    if (!window.speechSynthesis) return;
    window.speechSynthesis.cancel();
    const u = new SpeechSynthesisUtterance(text);
    window.speechSynthesis.speak(u);
  };

  const startVoice = () => {
    type VoiceResult = { results: ArrayLike<ArrayLike<{ transcript: string }>> };
    type VoiceRecognition = { lang: string; onresult: ((event: VoiceResult) => void) | null; onerror: (() => void) | null; start: () => void };
    const W = window as Window & { SpeechRecognition?: new () => VoiceRecognition; webkitSpeechRecognition?: new () => VoiceRecognition };
    const SR = W.SpeechRecognition || W.webkitSpeechRecognition;
    if (!SR) { message.error("Voice input not supported in this browser."); return; }
    const r = new SR();
    r.lang = navigator.language;
    r.onresult = (e) => setDraft((v) => `${v}${v ? " " : ""}${e.results[0][0].transcript}`);
    r.onerror = () => message.error("Could not capture voice.");
    r.start();
  };

  const currentMode = session?.user && authStatus === "authenticated" ? "account" : entryMode;

  /* ---------- loading / welcome / app ---------- */
  if (currentMode === "visitor") {
    return <AuthWelcome googleAvailable={googleAvailable} googleUnavailableReason={googleUnavailableReason} manualAuthAvailable={manualAuthAvailable} onGoogle={() => void beginGoogleSignIn()} onGuest={() => void continueAsGuest()} />;
  }

  return (
    <ChatWorkspace
      session={session}
      entryMode={currentMode}
      conversations={conversations}
      grouped={grouped}
      filteredCount={filtered.length}
      active={active}
      activeId={activeId}
      setActiveId={setActiveId}
      collapsed={collapsed}
      setCollapsed={setCollapsed}
      mobileOpen={mobileOpen}
      setMobileOpen={setMobileOpen}
      query={query}
      setQuery={setQuery}
      googleAvailable={googleAvailable}
      conversationSyncAvailable={conversationSyncAvailable}
      streaming={streaming}
      copied={copied}
      error={error}
      setError={setError}
      draft={draft}
      setDraft={setDraft}
      files={files}
      setFiles={setFiles}
      fileRef={fileRef}
      textareaRef={textareaRef}
      newChat={newChat}
      submit={() => void submit()}
      stop={stop}
      startVoice={startVoice}
      addFiles={addFiles}
      copyText={copyText}
      regenerate={(index) => void regenerate(index)}
      toggleFeedback={toggleFeedback}
      toggleSpeech={toggleSpeech}
      renameChat={renameChat}
      deleteChat={deleteChat}
      endSession={() => void endSession()}
      beginGoogleSignIn={beginGoogleSignIn}
      onThemeChange={setThemeMode}
    />
  );
}
