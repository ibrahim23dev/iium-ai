import { getConversationOwner } from "@/lib/conversation-owner";
import { prisma } from "@/lib/prisma";

export async function DELETE(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const owner = await getConversationOwner();
  if (!owner) return Response.json({ error: "Start a guest session or sign in first." }, { status: 401 });
  if (!process.env.DATABASE_URL) return Response.json({ error: "Conversation sync is not configured." }, { status: 503 });
  const { id } = await params;
  const result = await prisma.conversation.deleteMany({ where: { id, ...(owner.kind === "account" ? { userId: owner.userId } : { guestSessionId: owner.guestSessionId }) } });
  return Response.json({ deleted: result.count });
}
