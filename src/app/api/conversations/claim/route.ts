import { auth } from "../../../../../auth";
import { getGuestSession } from "@/lib/guest-session";
import { prisma } from "@/lib/prisma";

export async function POST() {
  const session = await auth();
  if (!session?.user?.id) return Response.json({ error: "Sign in with Google to claim guest conversations." }, { status: 401 });
  const guest = await getGuestSession();
  if (!guest) return Response.json({ claimed: 0 });
  if (!process.env.DATABASE_URL) return Response.json({ error: "Conversation sync is not configured." }, { status: 503 });
  const result = await prisma.conversation.updateMany({ where: { guestSessionId: guest.id, userId: null }, data: { userId: session.user.id, guestSessionId: null } });
  await prisma.guestSession.updateMany({ where: { id: guest.id, status: "active" }, data: { status: "claimed" } });
  return Response.json({ claimed: result.count });
}
