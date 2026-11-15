import { NextRequest } from "next/server";
import { GEMINI_MODEL, geminiError, getGeminiClient, toGeminiContents, validateGeminiModel, type ChatMessage, type ChatRole } from "@/lib/gemini";
import { auth } from "../../../../../auth";
import { getGuestSession } from "@/lib/guest-session";

export const runtime = "nodejs";
export const maxDuration = 120;

const MAX_BODY_BYTES = 6_000_000;
const MAX_MESSAGES = 80;
const MAX_MESSAGE_LENGTH = 30_000;
const validRoles = new Set<ChatRole>(["system", "user", "assistant"]);
function jsonError(message: string, status: number) { return Response.json({ error: { message } }, { status }); }

export async function POST(request: NextRequest) {
  const session = await auth();
  const guest = session?.user ? null : await getGuestSession();
  if (!session?.user && !guest) return jsonError("Continue as Guest or sign in with Google to start chatting.", 401);
  if (!process.env.GEMINI_API_KEY) return jsonError("Gemini is not configured. Add GEMINI_API_KEY to the server environment.", 503);
  const contentLength = Number(request.headers.get("content-length") || 0);
  if (contentLength > MAX_BODY_BYTES) return jsonError("Request is too large.", 413);
  let body: unknown;
  try { body = await request.json(); } catch { return jsonError("Request body must be valid JSON.", 400); }
  if (!body || typeof body !== "object") return jsonError("Request body must be an object.", 400);
  const record = body as Record<string, unknown>;
  if (!Array.isArray(record.messages) || record.messages.length === 0 || record.messages.length > MAX_MESSAGES) return jsonError(`messages must contain between 1 and ${MAX_MESSAGES} entries.`, 400);
  const messages: ChatMessage[] = [];
  for (const value of record.messages) {
    if (!value || typeof value !== "object") return jsonError("Each message must have a role and text content.", 400);
    const item = value as Record<string, unknown>;
    if (!validRoles.has(item.role as ChatRole) || (typeof item.content !== "string") || (typeof item.image !== "undefined" && (!item.image || typeof item.image !== "object"))) return jsonError("Each message must have a supported role, text, and optional image.", 400);
    if (item.content.length > MAX_MESSAGE_LENGTH) return jsonError("A message is too long.", 413);
    const image = item.image as Record<string, unknown> | undefined;
    if (image && (typeof image.mimeType !== "string" || typeof image.data !== "string" || image.data.length > 5_600_000)) return jsonError("The image attachment is invalid or too large.", 413);
    if (!item.content.trim() && !image) return jsonError("Each message must contain text or an image.", 400);
    messages.push({ role: item.role as ChatRole, content: item.content, ...(image ? { image: { mimeType: image.mimeType as string, data: image.data as string } } : {}) });
  }
  if (!messages.some((message) => message.role === "user")) return jsonError("At least one user message is required.", 400);
  if (record.model !== undefined && !validateGeminiModel(record.model)) return jsonError("This chat model is not enabled for this application.", 400);

  const encoder = new TextEncoder();
  const abort = new AbortController();
  const timeout = setTimeout(() => abort.abort(), 110_000);
  request.signal.addEventListener("abort", () => abort.abort(), { once: true });
  const output = new ReadableStream<Uint8Array>({
    async start(controller) {
      let emitted = false;
      try {
        const { systemInstruction, contents } = toGeminiContents(messages);
        const stream = await getGeminiClient().models.generateContentStream({ model: GEMINI_MODEL, contents, config: { systemInstruction, abortSignal: abort.signal } });
        for await (const chunk of stream) {
          if (abort.signal.aborted) break;
          const text = chunk.text || "";
          if (text) { emitted = true; controller.enqueue(encoder.encode(text)); }
        }
        if (!abort.signal.aborted && !emitted) controller.enqueue(encoder.encode(""));
        controller.close();
      } catch (error) {
        if (!abort.signal.aborted) {
          const normalized = geminiError(error);
          // Errors after streaming begins are sent as a terminal SSE frame, avoiding raw provider details.
          controller.enqueue(encoder.encode(`\n\n[IIUM_ERROR]${JSON.stringify(normalized.message)}`));
          controller.close();
        } else controller.close();
      } finally { clearTimeout(timeout); }
    },
    cancel() { abort.abort(); clearTimeout(timeout); },
  });
  return new Response(output, { headers: { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "no-cache, no-transform", "X-Content-Type-Options": "nosniff", "X-Gemini-Model": GEMINI_MODEL } });
}
