import { auth } from "../../../../auth";
import { clearGuestCookie, createGuestCookie, getGuestSession } from "@/lib/guest-session";
import { prisma } from "@/lib/prisma";

async function pruneExpiredGuests() {
  const expired = await prisma.guestSession.findMany({ where: { expiresAt: { lte: new Date() } }, select: { id: true } });
  const ids = expired.map((session) => session.id);
  if (ids.length) await prisma.conversation.deleteMany({ where: { guestSessionId: { in: ids } } });
  await prisma.guestSession.deleteMany({ where: { id: { in: ids } } });
}

export async function GET() {
  const session = await auth();
  const googleAvailable = Boolean(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET && process.env.AUTH_SECRET && process.env.DATABASE_URL);
  const guest = await getGuestSession();
  const conversationSyncAvailable = Boolean(process.env.DATABASE_URL);
  if (conversationSyncAvailable) await pruneExpiredGuests().catch(() => undefined);
  if (session?.user) return Response.json({ mode: "account", guestSessionId: guest?.id ?? null, googleAvailable, conversationSyncAvailable });
  return Response.json({ mode: guest ? "guest" : "visitor", guestSessionId: guest?.id ?? null, expiresAt: guest?.expiresAt ?? null, googleAvailable, conversationSyncAvailable });
}

export async function POST() {
  const session = await auth();
  if (session?.user) return Response.json({ mode: "account" });
  const guest = await createGuestCookie();
  if (process.env.DATABASE_URL) {
    await pruneExpiredGuests().catch(() => undefined);
    await prisma.guestSession.create({ data: { id: guest.id, expiresAt: new Date(guest.expiresAt) } }).catch(() => undefined);
  }
  return Response.json({ mode: "guest", guestSessionId: guest.id, expiresAt: guest.expiresAt, conversationSyncAvailable: Boolean(process.env.DATABASE_URL) });
}

export async function DELETE() {
  const guest = await getGuestSession();
  if (guest && process.env.DATABASE_URL) {
    await prisma.$transaction([
      prisma.guestSession.updateMany({ where: { id: guest.id, status: "active" }, data: { status: "ended" } }),
      prisma.conversation.deleteMany({ where: { guestSessionId: guest.id } }),
    ]).catch(() => undefined);
  }
  await clearGuestCookie();
  return Response.json({ mode: "visitor" });
}
