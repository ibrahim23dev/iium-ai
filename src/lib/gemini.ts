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

export function geminiError(error: unknown): { message: string; status: number; diagnostic: string } {
  const value = (error && typeof error === "object" ? error : {}) as Record<string, unknown>;
  const cause = value.cause && typeof value.cause === "object" ? value.cause as Record<string, unknown> : {};
  const body = value.error && typeof value.error === "object" ? value.error as Record<string, unknown> : {};
  const response = value.response && typeof value.response === "object" ? value.response as Record<string, unknown> : {};
  const status = Number(value.status || value.statusCode || response.status || (typeof value.code === "number" ? value.code : 0));
  const originalMessage = [value.message, cause.message, body.message].filter((part): part is string => typeof part === "string").join(" ").slice(0, 500);
  const details = originalMessage.toLowerCase();
  const code = String(cause.code || value.code || "");
  // Only log the provider's message; SDK error strings can include request URLs and query API keys.
  const safeMessage = originalMessage.replace(/https?:\/\/[^\s"']+/gi, "[provider URL]").replace(/(key|api_key)=([^&\s]+)/gi, "$1=[redacted]");
  const diagnostic = `Gemini request failed${status ? ` (HTTP ${status})` : ""}${code ? ` [${code}]` : ""}${safeMessage ? `: ${safeMessage}` : " (no provider message or status was exposed by the SDK)"}`.slice(0, 700);
  if (value?.name === "AbortError") return { message: "The request timed out or was interrupted. Please try again.", status: 504, diagnostic };
  if (/fetch failed|econnreset|enotfound|eai_again|etimedout|socket hang up|network|dns/.test(`${details} ${code.toLowerCase()}`)) return { message: "Could not reach Google Gemini. Check your internet connection, firewall, or proxy, then try again.", status: 503, diagnostic };
  if (status === 401 || status === 400 && /api key|api_key_invalid|invalid api key/.test(details)) return { message: "Gemini rejected the API key. Check GEMINI_API_KEY in .env and restart the server.", status: 502, diagnostic };
  if (status === 403 && /free tier is not available|project unavailable|set up billing|permission_denied|api has not been used/.test(details)) return { message: "Gemini access is disabled for this Google project or key. Enable the Gemini API or check project eligibility in Google AI Studio.", status: 503, diagnostic };
  if (status === 403) return { message: "Gemini access is forbidden for this key or project. Check the Gemini API settings and key restrictions.", status: 502, diagnostic };
  if (status === 429) return { message: "Gemini rate limit reached. Wait a little and try again, or review the project quota in Google AI Studio.", status: 429, diagnostic };
  if (status === 404) return { message: `Gemini model “${GEMINI_MODEL}” was not found or is unavailable to this API key. Check GEMINI_MODEL.`, status: 502, diagnostic };
  if (status === 400) return { message: "Gemini could not process this request. Check the message, model compatibility, or attachment format.", status: 400, diagnostic };
  return { message: `Gemini returned an unexpected error${status ? ` (HTTP ${status})` : ""}. ${safeMessage || "The provider did not include a reason."} Check GEMINI_API_KEY and GEMINI_MODEL in .env, then restart the server.`, status: 502, diagnostic };
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


//export const GEMINI_MODEL = process.env.GEMINI_MODEL || "gemini-2.5-flash";