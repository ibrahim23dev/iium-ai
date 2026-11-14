"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { create } from "zustand";
import {
  Archive, ArrowDown, ArrowLeft, ArrowUp, AudioLines, Check, ChevronDown, ChevronRight,
  CircleHelp, Code2, Copy, FileText, Globe2, ImagePlus, Menu, MessageSquarePlus, Mic, MoreHorizontal,
  Paperclip, PanelLeftClose, PanelLeftOpen, Plus, Search, Settings2, ShieldCheck, Sparkles,
  Sun, Moon, ThumbsDown, ThumbsUp, X,
} from "lucide-react";
import { streamMockResponse } from "@/lib/mock-ai";
import type { Attachment, Conversation, Message, ModelId } from "@/types/chat";

type Store = { conversations: Conversation[]; activeId: string | null; setConversations: (value: Conversation[]) => void; setActiveId: (id: string | null) => void };
const useChatStore = create<Store>((set) => ({ conversations: [], activeId: null, setConversations: (conversations) => set({ conversations }), setActiveId: (activeId) => set({ activeId }) }));
const models: { id: ModelId; label: string }[] = [
  { id: "default", label: "IIUM AI Default" }, { id: "openai", label: "OpenAI" }, { id: "gemini", label: "Gemini" }, { id: "deepseek", label: "DeepSeek" },
];
const suggestions = [
  { title: "Explain something to me", prompt: "Explain a complex idea in simple terms", icon: CircleHelp },
  { title: "Help me write", prompt: "Help me write a clear and engaging piece", icon: FileText },
  { title: "Generate code", prompt: "Help me write and understand some code", icon: Code2 },
  { title: "Analyze a document", prompt: "Help me analyze this document", icon: Search },
  { title: "Research a topic", prompt: "Help me research a topic and organize my findings", icon: Globe2 },
  { title: "Solve a problem", prompt: "Help me think through a problem step by step", icon: Sparkles },
];
const id = () => crypto.randomUUID();
const dateLabel = (timestamp: number) => new Date(timestamp).toLocaleDateString(undefined, { month: "short", day: "numeric" });

export default function ChatApp() {
  const { conversations, activeId, setConversations, setActiveId } = useChatStore();
  const [hydrated, setHydrated] = useState(false);
  const [collapsed, setCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [model, setModel] = useState<ModelId>("default");
  const [modelOpen, setModelOpen] = useState(false);
  const [theme, setTheme] = useState<"light" | "dark" | "system">("system");
  const [draft, setDraft] = useState("");
  const [files, setFiles] = useState<Attachment[]>([]);
  const [streaming, setStreaming] = useState(false);
  const [error, setError] = useState("");
  const [menuFor, setMenuFor] = useState<string | null>(null);
  const [copied, setCopied] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    try {
      const saved = localStorage.getItem("iium-ai-conversations");
      if (saved) setConversations(JSON.parse(saved) as Conversation[]);
      const savedTheme = localStorage.getItem("iium-ai-theme") as typeof theme | null;
      if (savedTheme) setTheme(savedTheme);
    } catch { setError("Saved chats could not be loaded."); }
    setHydrated(true);
  }, [setConversations]);
  useEffect(() => { if (hydrated) localStorage.setItem("iium-ai-conversations", JSON.stringify(conversations)); }, [conversations, hydrated]);
  useEffect(() => {
    localStorage.setItem("iium-ai-theme", theme);
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
  }, [theme]);
  useEffect(() => { const listener = (event: KeyboardEvent) => { if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") { event.preventDefault(); document.getElementById("chat-search")?.focus(); } }; window.addEventListener("keydown", listener); return () => window.removeEventListener("keydown", listener); }, []);

  const active = conversations.find((conversation) => conversation.id === activeId) ?? null;
  const filtered = useMemo(() => conversations.filter((conversation) => conversation.title.toLowerCase().includes(query.toLowerCase())), [conversations, query]);
  const grouped = useMemo(() => {
    const now = Date.now();
    return [
      { label: "Today", items: filtered.filter((item) => now - item.updatedAt < 86400000) },
      { label: "Previous 7 days", items: filtered.filter((item) => now - item.updatedAt >= 86400000 && now - item.updatedAt < 604800000) },
      { label: "Previous 30 days", items: filtered.filter((item) => now - item.updatedAt >= 604800000 && now - item.updatedAt < 2592000000) },
      { label: "Older", items: filtered.filter((item) => now - item.updatedAt >= 2592000000) },
    ];
  }, [filtered]);

  const newChat = () => { abortRef.current?.abort(); setStreaming(false); setError(""); setDraft(""); setFiles([]); setActiveId(null); setMobileOpen(false); };
  const updateConversation = useCallback((idValue: string, updater: (conversation: Conversation) => Conversation) => setConversations(conversations.map((item) => item.id === idValue ? updater(item) : item)), [conversations, setConversations]);
  const submit = async (text = draft) => {
    const content = text.trim();
    if ((!content && !files.length) || streaming) return;
    let conversation = active;
    if (!conversation) {
      conversation = { id: id(), title: (content || files[0]?.name || "New chat").slice(0, 42), updatedAt: Date.now(), model, messages: [] };
      setConversations([conversation, ...conversations]); setActiveId(conversation.id);
    }
    const conversationId = conversation.id;
    const userMessage: Message = { id: id(), role: "user", content, createdAt: Date.now(), attachments: files };
    const assistantMessage: Message = { id: id(), role: "assistant", content: "", createdAt: Date.now() };
    const currentModel = active ? conversation.model : model;
    const attachments = files;
    setDraft(""); setFiles([]); setError(""); setStreaming(true);
    if (textareaRef.current) textareaRef.current.style.height = "auto";
    setConversations((list) => list.map((item) => item.id === conversationId ? { ...item, model: currentModel, title: item.messages.length === 0 ? (content || attachments[0]?.name || "New chat").slice(0, 42) : item.title, updatedAt: Date.now(), messages: [...item.messages, userMessage, assistantMessage] } : item));
    const controller = new AbortController(); abortRef.current = controller;
    try {
      let response = "";
      for await (const chunk of streamMockResponse(content, currentModel, attachments, controller.signal)) {
        response += chunk;
        setConversations((list) => list.map((item) => item.id === conversationId ? { ...item, updatedAt: Date.now(), messages: item.messages.map((message) => message.id === assistantMessage.id ? { ...message, content: response } : message) } : item));
      }
    } catch { setError("Something interrupted this response. Try again."); }
    finally { setStreaming(false); abortRef.current = null; }
  };
  const stop = () => { abortRef.current?.abort(); setStreaming(false); };
  const regenerate = async (messageIndex: number) => {
    if (!active || streaming) return;
    const previous = active.messages[messageIndex - 1];
    if (!previous || previous.role !== "user") return;
    setConversations(conversations.map((item) => item.id === active.id ? { ...item, messages: item.messages.slice(0, messageIndex) } : item));
    await submit(previous.content);
  };
  const addFiles = (fileList: FileList | null) => {
    if (!fileList) return;
    const added = Array.from(fileList).map((file) => ({ id: id(), name: file.name, type: file.type, url: URL.createObjectURL(file), size: file.size }));
    setFiles((current) => [...current, ...added]);
  };
  const copyText = async (text: string, key: string) => { await navigator.clipboard.writeText(text); setCopied(key); window.setTimeout(() => setCopied(null), 1500); };
  const deleteChat = (chatId: string) => { setConversations(conversations.filter((item) => item.id !== chatId)); if (activeId === chatId) setActiveId(null); setMenuFor(null); };
  const renameChat = (chat: Conversation) => { const title = window.prompt("Rename conversation", chat.title); if (title?.trim()) updateConversation(chat.id, (item) => ({ ...item, title: title.trim() })); setMenuFor(null); };
  const toggleFeedback = (messageId: string, feedback: "up" | "down") => { if (!active) return; updateConversation(active.id, (item) => ({ ...item, messages: item.messages.map((message) => message.id === messageId ? { ...message, feedback: message.feedback === feedback ? undefined : feedback } : message) })); };
  const toggleSpeech = (text: string) => { if (!window.speechSynthesis) return; window.speechSynthesis.cancel(); const utterance = new SpeechSynthesisUtterance(text); window.speechSynthesis.speak(utterance); };
  const startVoice = () => {
    const SpeechRecognition = (window as Window & { SpeechRecognition?: new () => SpeechRecognition; webkitSpeechRecognition?: new () => SpeechRecognition }).SpeechRecognition || (window as Window & { webkitSpeechRecognition?: new () => SpeechRecognition }).webkitSpeechRecognition;
    if (!SpeechRecognition) { setError("Voice input is not supported in this browser."); return; }
    const recognition = new SpeechRecognition(); recognition.lang = navigator.language; recognition.onresult = (event) => setDraft((value) => `${value}${value ? " " : ""}${event.results[0][0].transcript}`); recognition.onerror = () => setError("Could not capture your voice. Please try again."); recognition.start();
  };

  return <div className="app-shell">
    <aside className={`sidebar ${collapsed ? "sidebar-collapsed" : ""} ${mobileOpen ? "sidebar-mobile-open" : ""}`}>
      <div className="sidebar-top">
        <a className="brand" href="#" onClick={(event) => { event.preventDefault(); newChat(); }} aria-label="IIUM AI home"><span className="brand-mark"><Sparkles size={18} strokeWidth={1.8} /></span>{!collapsed && <span className="brand-copy"><strong>IIUM AI</strong><small>Think smarter. Create more.</small></span>}</a>
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
        <button className="nav-row" onClick={() => setError("Settings are coming soon.")} title={collapsed ? "Settings" : undefined}><Settings2 size={17} /><span>Settings</span></button>
        <button className="profile-button" title="Account profile"><span className="avatar">A</span><span className="profile-copy"><strong>Abdullah</strong><small>Free plan</small></span><MoreHorizontal size={17} className="profile-more" /></button>
      </div>
    </aside>
    {mobileOpen && <button className="mobile-backdrop" aria-label="Close navigation" onClick={() => setMobileOpen(false)} />}
    <main className="main-panel">
      <header className="topbar"><button className="icon-button mobile-menu-button" aria-label="Open navigation" onClick={() => setMobileOpen(true)}><Menu size={20} /></button>{active ? <div className="topbar-title">{active.title}</div> : <div className="topbar-spacer" />}<div className="topbar-actions"><span className="private-indicator"><ShieldCheck size={14} /> Private workspace</span><div className="theme-control" aria-label="Theme"><button onClick={() => setTheme(theme === "light" ? "dark" : "light")} title={`Theme: ${theme}. Click to switch between light and dark`} className="icon-button">{theme === "dark" ? <Moon size={17} /> : <Sun size={17} />}</button><select aria-label="Theme preference" value={theme} onChange={(event) => setTheme(event.target.value as typeof theme)}><option value="system">System</option><option value="light">Light</option><option value="dark">Dark</option></select></div></div></header>
      <section className={`conversation ${active ? "has-messages" : "welcome-view"}`}>
        {active ? <div className="messages-area">{active.messages.map((message, index) => <MessageView key={message.id} message={message} index={index} isLast={index === active.messages.length - 1} streaming={streaming && index === active.messages.length - 1} copied={copied === message.id} onCopy={() => copyText(message.content, message.id)} onRegenerate={() => regenerate(index)} onFeedback={(value) => toggleFeedback(message.id, value)} onSpeak={() => toggleSpeech(message.content)} />)}{streaming && active.messages.at(-1)?.content === "" && <div className="typing-indicator"><span /><span /><span /></div>}{error && <div className="inline-error">{error}<button onClick={() => setError("")}><X size={14} /></button></div>}</div> : <div className="welcome-content"><div className="welcome-kicker"><span className="kicker-line" /> A calmer space to think <span className="kicker-line" /></div><h1>What can I help you<br /><span>with today?</span></h1><p className="welcome-subtitle">Ask anything. Explore ideas. Get things done.</p><div className="suggestion-grid">{suggestions.map(({ title, prompt, icon: Icon }) => <button className="suggestion-card" key={title} onClick={() => { setDraft(prompt); textareaRef.current?.focus(); }}><span className="suggestion-icon"><Icon size={17} strokeWidth={1.8} /></span><span>{title}</span><ArrowUp size={15} className="suggestion-arrow" /></button>)}</div>{error && <div className="inline-error">{error}<button onClick={() => setError("")}><X size={14} /></button></div>}</div>}
        <div className="composer-wrap">
          {files.length > 0 && <div className="attachment-list">{files.map((file) => <div className="attachment-chip" key={file.id}>{file.type.startsWith("image/") ? <img src={file.url} alt={file.name} /> : <FileText size={16} />}<span>{file.name}</span><button aria-label={`Remove ${file.name}`} onClick={() => { URL.revokeObjectURL(file.url); setFiles(files.filter((item) => item.id !== file.id)); }}><X size={13} /></button></div>)}</div>}
          <div className="composer"><textarea ref={textareaRef} value={draft} onChange={(event) => { setDraft(event.target.value); event.target.style.height = "auto"; event.target.style.height = `${Math.min(event.target.scrollHeight, 180)}px`; }} onKeyDown={(event) => { if (event.key === "Enter" && !event.shiftKey && !event.nativeEvent.isComposing) { event.preventDefault(); void submit(); } }} placeholder="Message IIUM AI..." rows={1} aria-label="Message IIUM AI" /><div className="composer-toolbar"><div className="composer-tools"><input ref={fileRef} type="file" multiple hidden onChange={(event) => { addFiles(event.target.files); event.currentTarget.value = ""; }} /><button className="tool-button" onClick={() => { if (fileRef.current) fileRef.current.accept = ""; fileRef.current?.click(); }} aria-label="Attach files"><Paperclip size={17} /><span>Attach</span></button><button className="tool-button" onClick={() => { if (fileRef.current) fileRef.current.accept = "image/*"; fileRef.current?.click(); }} aria-label="Attach image"><ImagePlus size={17} /><span>Image</span></button><div className="model-select-wrap"><button className="model-select" onClick={() => setModelOpen(!modelOpen)} aria-expanded={modelOpen}><span className="model-spark"><Sparkles size={13} /></span>{models.find((item) => item.id === (active?.model ?? model))?.label}<ChevronDown size={14} /></button>{modelOpen && <div className="model-menu">{models.map((item) => <button key={item.id} onClick={() => { setModel(item.id); setModelOpen(false); if (active) updateConversation(active.id, (chat) => ({ ...chat, model: item.id })); }}><span>{item.label}<small>{item.id === "default" ? "Preview mode" : "Not connected"}</small></span>{(active?.model ?? model) === item.id && <Check size={15} />}</button>)}</div>}</div></div><div className="composer-submit"><button className="voice-button" onClick={startVoice} aria-label="Voice input" title="Voice input"><Mic size={17} /></button>{streaming ? <button className="send-button stop-button" aria-label="Stop generation" onClick={stop}><span className="stop-square" /></button> : <button className="send-button" aria-label="Send message" onClick={() => void submit()} disabled={!draft.trim() && !files.length}><ArrowUp size={19} strokeWidth={2.2} /></button>}</div></div></div>
          <div className="composer-note"><span><ShieldCheck size={12} /> Your conversations stay in this browser</span><span>Enter to send <i>·</i> Shift + Enter for a new line</span></div>
        </div>
      </section>
      <footer className="page-footer"><span>IIUM AI <i>·</i> A thoughtful space to create</span><button onClick={() => setError("Help center is coming soon.")}>Help & feedback <ArrowDown size={12} className="footer-arrow" /></button></footer>
    </main>
  </div>;
}

function MessageCircleIcon() { return <span className="history-message-icon"><MessageSquarePlus size={15} /></span>; }

type MessageViewProps = { message: Message; index: number; isLast: boolean; streaming: boolean; copied: boolean; onCopy: () => void; onRegenerate: () => void; onFeedback: (value: "up" | "down") => void; onSpeak: () => void };
function MessageView({ message, isLast, streaming, copied, onCopy, onRegenerate, onFeedback, onSpeak }: MessageViewProps) {
  const [speaking, setSpeaking] = useState(false);
  const audioAction = () => { onSpeak(); setSpeaking(true); window.setTimeout(() => setSpeaking(false), 2400); };
  return <article className={`message message-${message.role}`}>
    {message.role === "assistant" && <div className="assistant-avatar"><Sparkles size={15} /></div>}
    <div className="message-body">{message.role === "user" ? <><div className="user-bubble">{message.content && <p>{message.content}</p>}{message.attachments?.length ? <div className="message-attachments">{message.attachments.map((file) => file.type.startsWith("image/") ? <img key={file.id} src={file.url} alt={file.name} /> : <span key={file.id}><FileText size={14} />{file.name}</span>)}</div> : null}</div><div className="message-time">{dateLabel(message.createdAt)}</div></> : <><div className="assistant-content">{message.content ? <ReactMarkdown remarkPlugins={[remarkGfm]} components={{ code({ className, children, ...props }) { const inline = !className; return inline ? <code className="inline-code" {...props}>{children}</code> : <CodeBlock code={String(children).replace(/\n$/, "")} language={className?.replace("language-", "") || "text"} />; }, table({ children }) { return <div className="table-scroll"><table>{children}</table></div>; } }}>{message.content}</ReactMarkdown> : <span className="typing-indicator"><span /><span /><span /></span>}</div>{!streaming && message.content && <div className="message-actions"><button onClick={onCopy} title="Copy response">{copied ? <Check size={14} /> : <Copy size={14} />}<span>{copied ? "Copied" : "Copy"}</span></button><button onClick={onRegenerate} title="Regenerate response"><ArrowLeft size={14} /><span>Regenerate</span></button><button className={message.feedback === "up" ? "feedback-active" : ""} onClick={() => onFeedback("up")} title="Good response"><ThumbsUp size={14} /></button><button className={message.feedback === "down" ? "feedback-active" : ""} onClick={() => onFeedback("down")} title="Poor response"><ThumbsDown size={14} /></button><button className={speaking ? "feedback-active" : ""} onClick={audioAction} title="Read aloud"><AudioLines size={14} /></button></div>}</>}</div>
  </article>;
}

function CodeBlock({ code, language }: { code: string; language: string }) {
  const [copied, setCopied] = useState(false);
  return <div className="code-block"><div className="code-header"><span>{language}</span><button onClick={async () => { await navigator.clipboard.writeText(code); setCopied(true); window.setTimeout(() => setCopied(false), 1500); }}>{copied ? <Check size={13} /> : <Copy size={13} />}{copied ? "Copied" : "Copy code"}</button></div><pre><code>{code}</code></pre></div>;
}
