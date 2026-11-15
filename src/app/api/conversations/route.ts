import { getConversationOwner } from "@/lib/conversation-owner";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";
const MAX_BODY_BYTES = 8_000_000;
function whereFor(owner: NonNullable<Awaited<ReturnType<typeof getConversationOwner>>>) {
  return owner.kind === "account" ? { userId: owner.userId } : { guestSessionId: owner.guestSessionId };
}
function asClientConversation(item: { id: string; title: string; model: string; updatedAt: Date; messages: { id: string; role: string; content: string; createdAt: Date; sequence: number; attachments: string | null; feedback: string | null }[] }) {
  return { id: item.id, title: item.title, model: item.model, updatedAt: item.updatedAt.getTime(), messages: item.messages.map((message) => ({ id: message.id, role: message.role, content: message.content, createdAt: message.createdAt.getTime(), ...(message.attachments ? { attachments: JSON.parse(message.attachments) } : {}), ...(message.feedback ? { feedback: message.feedback } : {}) })) };
}

export async function GET() {
  const owner = await getConversationOwner();
  if (!owner) return Response.json({ error: "Start a guest session or sign in first." }, { status: 401 });
  if (!process.env.DATABASE_URL) return Response.json({ error: "Conversation sync is not configured." }, { status: 503 });
  const conversations = await prisma.conversation.findMany({ where: whereFor(owner), orderBy: { updatedAt: "desc" }, include: { messages: { orderBy: { sequence: "asc" } } } });
  return Response.json({ conversations: conversations.map(asClientConversation) }, { headers: { "Cache-Control": "no-store" } });
}

export async function PUT(request: Request) {
  const owner = await getConversationOwner();
  if (!owner) return Response.json({ error: "Start a guest session or sign in first." }, { status: 401 });
  if (!process.env.DATABASE_URL) return Response.json({ error: "Conversation sync is not configured." }, { status: 503 });
  if (Number(request.headers.get("content-length") || 0) > MAX_BODY_BYTES) return Response.json({ error: "Conversation data is too large." }, { status: 413 });
  let payload: unknown;
  try { payload = await request.json(); } catch { return Response.json({ error: "Invalid conversation data." }, { status: 400 }); }
  if (!payload || typeof payload !== "object" || !Array.isArray((payload as { conversations?: unknown }).conversations) || (payload as { conversations: unknown[] }).conversations.length > 100) return Response.json({ error: "Invalid conversation list." }, { status: 400 });
  const items = (payload as { conversations: unknown[] }).conversations;
  const parsed: { id: string; title: string; model: string; updatedAt: Date; messages: { id: string; role: string; content: string; createdAt: Date; sequence: number; attachments: string | null; feedback: string | null }[] }[] = [];
  for (const candidate of items) {
    if (!candidate || typeof candidate !== "object") return Response.json({ error: "Invalid conversation." }, { status: 400 });
    const item = candidate as Record<string, unknown>;
    if (typeof item.id !== "string" || item.id.length > 80 || typeof item.title !== "string" || item.title.length > 160 || typeof item.model !== "string" || !Number.isFinite(item.updatedAt) || !Array.isArray(item.messages) || item.messages.length > 200) return Response.json({ error: "Invalid conversation fields." }, { status: 400 });
    const messages: { id: string; role: string; content: string; createdAt: Date; sequence: number; attachments: string | null; feedback: string | null }[] = [];
    for (const [sequence, rawMessage] of item.messages.entries()) {
      if (!rawMessage || typeof rawMessage !== "object") return Response.json({ error: "Invalid message." }, { status: 400 });
      const message = rawMessage as Record<string, unknown>;
      if (typeof message.id !== "string" || message.id.length > 80 || !["user", "assistant"].includes(String(message.role)) || typeof message.content !== "string" || message.content.length > 30_000 || !Number.isFinite(message.createdAt) || (message.feedback !== undefined && !["up", "down"].includes(String(message.feedback)))) return Response.json({ error: "Invalid message fields." }, { status: 400 });
      const attachments = Array.isArray(message.attachments) ? JSON.stringify(message.attachments.slice(0, 8).map((file) => { const f = file as Record<string, unknown>; return { id: String(f.id || "").slice(0, 80), name: String(f.name || "file").slice(0, 180), type: String(f.type || "application/octet-stream").slice(0, 100), url: typeof f.url === "string" && f.url.startsWith("data:") ? "" : String(f.url || "").slice(0, 600), size: Number(f.size || 0) }; })) : null;
      messages.push({ id: message.id, role: String(message.role), content: message.content, sequence, createdAt: new Date(Number(message.createdAt)), attachments, feedback: typeof message.feedback === "string" ? message.feedback : null });
    }
    parsed.push({ id: item.id, title: item.title, model: item.model, updatedAt: new Date(Number(item.updatedAt)), messages });
  }
  const ids = parsed.map((item) => item.id);
  const existing = ids.length ? await prisma.conversation.findMany({ where: { id: { in: ids } }, select: { id: true, userId: true, guestSessionId: true } }) : [];
  if (existing.some((item) => owner.kind === "account" ? item.userId !== owner.userId : item.guestSessionId !== owner.guestSessionId)) return Response.json({ error: "A conversation is already owned by another session." }, { status: 403 });
  await prisma.$transaction(async (tx) => {
    for (const item of parsed) {
      const existingItem = existing.find((record) => record.id === item.id);
      const data = { title: item.title, model: item.model, updatedAt: item.updatedAt, ...(owner.kind === "account" ? { userId: owner.userId, guestSessionId: null } : { guestSessionId: owner.guestSessionId, userId: null }) };
      if (existingItem) {
        await tx.message.deleteMany({ where: { conversationId: item.id } });
        await tx.conversation.update({ where: { id: item.id }, data: { ...data, messages: { create: item.messages } } });
      } else {
        await tx.conversation.create({ data: { id: item.id, ...data, createdAt: new Date(Math.min(...item.messages.map((m) => m.createdAt.getTime()), item.updatedAt.getTime())), messages: { create: item.messages } } });
      }
    }
  });
  return Response.json({ ok: true, count: parsed.length });
}

export async function DELETE() {
  const owner = await getConversationOwner();
  if (!owner) return Response.json({ error: "Start a guest session or sign in first." }, { status: 401 });
  if (!process.env.DATABASE_URL) return Response.json({ error: "Conversation sync is not configured." }, { status: 503 });
  const result = await prisma.conversation.deleteMany({ where: whereFor(owner) });
  return Response.json({ deleted: result.count });
}
