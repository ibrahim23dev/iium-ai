export type ChatModel = { id: string; label: string; price: "Free tier"; note: string };
export const CHAT_MODELS: ChatModel[] = [
  { id: "gemini-3.5-flash-lite", label: "IIUM AI – Gemini Free", price: "Free tier", note: "Gemini 3.5 Flash-Lite · text and image input" },
];
export const DEFAULT_CHAT_MODEL = CHAT_MODELS[0].id;
