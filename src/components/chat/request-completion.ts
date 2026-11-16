import type { ModelId, Message } from "@/types/chat";
import { filesToGeminiImages } from "./chat-utils";

const ERROR_MARKER = "\n\n[IIUM_ERROR]";

export async function requestCompletion(args: {
  messages: Message[];
  model: ModelId;
  signal: AbortSignal;
  onText: (text: string) => void;
}) {
  const requestMessages = await Promise.all(args.messages.map(async ({ role, content, attachments }) => ({
    role,
    content,
    ...(role === "user" ? await filesToGeminiImages(attachments) : {}),
  })));
  const response = await fetch("/api/chat/completions", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ model: args.model, messages: requestMessages, stream: true }),
    signal: args.signal,
  });
  if (!response.ok) {
    const payload = await response.json().catch(() => null) as { error?: { message?: string } } | null;
    throw new Error(payload?.error?.message || `Chat request failed (${response.status}).`);
  }
  if (!response.body) throw new Error("The server returned an empty response stream.");

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let pending = "";
  let result = "";
  while (true) {
    const { done, value } = await reader.read();
    pending += decoder.decode(value, { stream: !done });
    const markerAt = pending.indexOf(ERROR_MARKER);
    if (markerAt >= 0) {
      const partial = pending.slice(0, markerAt);
      if (partial) { result += partial; args.onText(result); }
      const payload = pending.slice(markerAt + ERROR_MARKER.length);
      let message = "The AI provider returned an error. Please try again.";
      try { message = JSON.parse(payload) as string; } catch { /* Keep the safe fallback if a malformed frame arrives. */ }
      throw new Error(message);
    }
    if (done) {
      result += pending;
      break;
    }
    // Hold back a possible partial marker across network chunk boundaries.
    const safeLength = Math.max(0, pending.length - ERROR_MARKER.length + 1);
    if (safeLength) {
      result += pending.slice(0, safeLength);
      pending = pending.slice(safeLength);
      args.onText(result);
    }
  }
  if (result) args.onText(result);
  else if (!args.signal.aborted) throw new Error("The AI returned an empty response.");
  return result;
}
