import { auth } from "../../../../auth";
import { clearGuestCookie, createGuestCookie, getGuestSession } from "@/lib/guest-session";
import { prisma } from "@/lib/prisma";

async function checkDatabase() {
  if (!process.env.DATABASE_URL) return { configured: false, connected: false, message: "DATABASE_URL is missing from the server environment." };
  let timeout: ReturnType<typeof setTimeout> | undefined;
  try {
    await Promise.race([
      prisma.$runCommandRaw({ ping: 1 }),
      new Promise<never>((_, reject) => { timeout = setTimeout(() => reject(new Error("MongoDB ping timed out.")), 2500); }),
    ]);
    return { configured: true, connected: true, message: "MongoDB is connected. Conversations sync to your account or guest session." };
  } catch (error) {
    const detail = error instanceof Error ? error.message : "Unknown database connection error.";
    console.error("MongoDB connection check failed:", detail.replace(/mongodb(?:\+srv)?:\/\/[^\s]+/gi, "mongodb://[redacted]"));
    return { configured: true, connected: false, message: "MongoDB could not be reached. Check the Atlas network allowlist, database user, and DATABASE_URL in .env, then restart the app." };
  } finally {
    if (timeout) clearTimeout(timeout);
  }
}

export async function GET() {
  const [session, database, guest] = await Promise.all([auth(), checkDatabase(), getGuestSession()]);
  const googleAvailable = Boolean(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET && process.env.AUTH_SECRET && database.connected);
  const googleUnavailableReason = !process.env.GOOGLE_CLIENT_ID || !process.env.GOOGLE_CLIENT_SECRET
    ? "Google OAuth client ID or client secret is missing from the server environment."
    : !process.env.AUTH_SECRET
      ? "AUTH_SECRET is missing from the server environment."
      : !database.connected
        ? "Google sign-in needs MongoDB to save the user and OAuth account. Check the Atlas connection and DATABASE_URL."
        : null;
  const manualAuthAvailable = Boolean(process.env.AUTH_SECRET && database.connected);
  const conversationSyncAvailable = database.connected;
  if (session?.user) return Response.json({ mode: "account", guestSessionId: guest?.id ?? null, googleAvailable, googleUnavailableReason, manualAuthAvailable, conversationSyncAvailable, database });
  return Response.json({ mode: guest ? "guest" : "visitor", guestSessionId: guest?.id ?? null, expiresAt: guest?.expiresAt ?? null, googleAvailable, googleUnavailableReason, manualAuthAvailable, conversationSyncAvailable, database });
}

export async function POST() {
  const session = await auth();
  if (session?.user) return Response.json({ mode: "account" });
  const guest = await createGuestCookie();
  let conversationSyncAvailable = false;
  if (process.env.DATABASE_URL) {
    let timeout: ReturnType<typeof setTimeout> | undefined;
    try {
      await Promise.race([
        prisma.guestSession.upsert({
          where: { id: guest.id },
          create: { id: guest.id, expiresAt: new Date(guest.expiresAt) },
          update: {},
        }),
        new Promise<never>((_, reject) => { timeout = setTimeout(() => reject(new Error("MongoDB write timed out.")), 2500); }),
      ]);
      conversationSyncAvailable = true;
    } catch { /* Local guest sessions continue when cloud persistence is unavailable. */ }
    finally { if (timeout) clearTimeout(timeout); }
  }
  return Response.json({ mode: "guest", guestSessionId: guest.id, expiresAt: guest.expiresAt, conversationSyncAvailable });
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
