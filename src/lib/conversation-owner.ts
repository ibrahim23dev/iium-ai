import { auth } from "../../auth";
import { getGuestSession } from "@/lib/guest-session";
import { prisma } from "@/lib/prisma";

export async function getConversationOwner() {
  const session = await auth();
  if (session?.user?.id) return { kind: "account" as const, userId: session.user.id };
  const guest = await getGuestSession();
  if (guest) {
    if (process.env.DATABASE_URL) {
      try {
        const record = await prisma.guestSession.upsert({ where: { id: guest.id }, create: { id: guest.id, expiresAt: new Date(guest.expiresAt) }, update: {} });
        if (record.status !== "active" || record.expiresAt.getTime() <= Date.now()) return null;
      } catch { /* Database outages do not disable local guest chat. */ }
    }
    return { kind: "guest" as const, guestSessionId: guest.id, expiresAt: guest.expiresAt };
  }
  return null;
}
