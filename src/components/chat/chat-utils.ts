import { create } from "zustand";
import type { Attachment, Conversation, Message } from "@/types/chat";
import { CHAT_MODELS, DEFAULT_CHAT_MODEL } from "@/lib/gemini-model";
import { CircleHelp, Code2, FileText, Globe2, Search, Sparkles } from "lucide-react";

type ChatStore = {
  conversations: Conversation[];
  activeId: string | null;
  setConversations: (value: Conversation[] | ((current: Conversation[]) => Conversation[])) => void;
  setActiveId: (id: string | null) => void;
};

export const useChatStore = create<ChatStore>((set) => ({
  conversations: [],
  activeId: null,
  setConversations: (value) => set((state) => ({ conversations: typeof value === "function" ? value(state.conversations) : value })),
  setActiveId: (activeId) => set({ activeId }),
}));

export const suggestions = [
  { title: "Explain something", prompt: "Explain a complex idea in simple terms", icon: CircleHelp },
  { title: "Help me write", prompt: "Help me write a clear and engaging piece", icon: FileText },
  { title: "Generate code", prompt: "Help me write and understand some code", icon: Code2 },
  { title: "Analyze a document", prompt: "Help me analyze this document", icon: Search },
  { title: "Research a topic", prompt: "Help me research a topic and organize my findings", icon: Globe2 },
  { title: "Solve a problem", prompt: "Help me think through a problem step by step", icon: Sparkles },
];

export function isConversationList(value: unknown): value is Conversation[] {
  return Array.isArray(value) && value.every((entry) => Boolean(
    entry && typeof entry === "object" && typeof entry.id === "string" &&
    typeof entry.title === "string" && Number.isFinite(entry.updatedAt) &&
    typeof entry.model === "string" && Array.isArray(entry.messages) &&
    entry.messages.every((message: unknown) => {
      if (!message || typeof message !== "object") return false;
      const item = message as Message;
      return typeof item.id === "string" && ["user", "assistant"].includes(item.role) && typeof item.content === "string";
    })
  ));
}

export function loadConversations(): Conversation[] {
  try {
    const saved = localStorage.getItem("iium-ai-conversations");
    if (!saved) return [];
    const parsed: unknown = JSON.parse(saved);
    if (isConversationList(parsed)) return parsed.map((conversation) => ({
      ...conversation,
      model: CHAT_MODELS.some((model) => model.id === conversation.model) ? conversation.model : DEFAULT_CHAT_MODEL,
    }));
  } catch { /* Invalid or unavailable local data falls back to an empty history. */ }
  localStorage.removeItem("iium-ai-conversations");
  return [];
}

export function switchOwner(target: string, retained?: string) {
  const previous = localStorage.getItem("iium-ai-history-owner");
  if (previous && previous !== target && previous !== retained) {
    localStorage.removeItem("iium-ai-conversations");
    localStorage.setItem("iium-ai-history-owner", target);
    return true;
  }
  localStorage.setItem("iium-ai-history-owner", target);
  return false;
}

export const createId = () => crypto.randomUUID();
export const timestampNow = () => Date.now();

export async function filesToGeminiImages(attachments?: Attachment[]) {
  const files = attachments ?? [];
  if (files.some((file) => !file.type.startsWith("image/"))) throw new Error("Only image attachments are supported.");
  if (files.length > 1) throw new Error("Attach one image per message.");
  const file = files[0];
  if (!file) return {};
  const blob = await (await fetch(file.url)).blob();
  if (blob.size > 4 * 1024 * 1024) throw new Error(`${file.name} is larger than 4 MB.`);
  const data = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result).split(",")[1] || "");
    reader.onerror = () => reject(new Error(`Could not read ${file.name}.`));
    reader.readAsDataURL(blob);
  });
  return { image: { mimeType: blob.type, data } };
}
