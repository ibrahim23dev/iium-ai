import { GoogleGenAI, type Content, type Part } from "@google/genai";

export type ChatRole = "system" | "user" | "assistant";
export type ChatMessage = { role: ChatRole; content: string; image?: { mimeType: string; data: string } };
export const GEMINI_MODEL = process.env.GEMINI_MODEL || "gemini-3.5-flash-lite";
const MAX_IMAGE_BYTES = 4 * 1024 * 1024;

let client: GoogleGenAI | undefined;
export function getGeminiClient() {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) throw new Error("Gemini is not configured. Add GEMINI_API_KEY to the server environment.");
  return client ??= new GoogleGenAI({ apiKey });
}

export function validateGeminiModel(model: unknown) {
  return typeof model === "string" && model === GEMINI_MODEL;
}

export function geminiError(error: unknown): { message: string; status: number } {
  const value = error as { status?: number; code?: number; message?: string; name?: string };
  const status = Number(value?.status || value?.code || 0);
  const details = typeof value?.message === "string" ? value.message.toLowerCase() : "";
  if (status === 401) return { message: "Gemini rejected the API key. Check that GEMINI_API_KEY is correct and active.", status: 502 };
  if (status === 403 && /free tier is not available|project unavailable|set up billing/.test(details)) return { message: "This Google Cloud project does not have Gemini API free-tier access. Check project eligibility in Google AI Studio; this app will not switch to a paid model automatically.", status: 503 };
  if (status === 403) return { message: "Gemini access is forbidden for this key or project. Check the Gemini API settings for the Google Cloud project.", status: 502 };
  if (status === 429) return { message: "Gemini free-tier limit reached. Please wait a little and try again.", status: 429 };
  if (status === 404) return { message: "The configured Gemini model is unavailable. Check GEMINI_MODEL.", status: 502 };
  if (status === 400) return { message: "Gemini could not process this request. Check the message or attachment format.", status: 400 };
  if (value?.name === "AbortError") return { message: "The request was interrupted.", status: 499 };
  return { message: "Gemini is temporarily unavailable. Please try again.", status: 502 };
}

export function toGeminiContents(messages: ChatMessage[]): { systemInstruction?: string; contents: Content[] } {
  const systemInstruction = messages.filter((message) => message.role === "system").map((message) => message.content).join("\n\n") || "You are IIUM AI, a helpful assistant. Give clear, accurate answers.";
  const contents = messages.filter((message) => message.role !== "system").map((message) => {
    const parts: Part[] = [];
    if (message.content) parts.push({ text: message.content });
    if (message.image) {
      const bytes = Buffer.from(message.image.data, "base64");
      if (bytes.byteLength > MAX_IMAGE_BYTES) throw new Error("Images must be 4 MB or smaller.");
      if (!message.image.mimeType.startsWith("image/") || !["image/png", "image/jpeg", "image/webp", "image/gif"].includes(message.image.mimeType)) throw new Error("Use a PNG, JPEG, WebP, or GIF image.");
      parts.push({ inlineData: { mimeType: message.image.mimeType, data: message.image.data } });
    }
    return { role: message.role === "assistant" ? "model" : "user", parts } satisfies Content;
  });
  return { systemInstruction, contents };
}
