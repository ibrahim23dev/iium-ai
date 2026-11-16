import { hashPassword } from "@/lib/password";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";

export async function POST(request: Request) {
  if (!process.env.DATABASE_URL) return Response.json({ error: "Account registration is unavailable because the database is not configured." }, { status: 503 });
  let payload: unknown;
  try { payload = await request.json(); } catch { return Response.json({ error: "Enter your name, email, and password." }, { status: 400 }); }
  if (!payload || typeof payload !== "object") return Response.json({ error: "Invalid registration details." }, { status: 400 });
  const { name, email, password } = payload as Record<string, unknown>;
  const normalizedEmail = typeof email === "string" ? email.trim().toLowerCase() : "";
  const normalizedName = typeof name === "string" ? name.trim() : "";
  if (!normalizedName || normalizedName.length > 100) return Response.json({ error: "Enter a name up to 100 characters." }, { status: 400 });
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizedEmail) || normalizedEmail.length > 254) return Response.json({ error: "Enter a valid email address." }, { status: 400 });
  if (typeof password !== "string" || password.length < 10 || password.length > 200) return Response.json({ error: "Use a password between 10 and 200 characters." }, { status: 400 });
  try {
    const passwordHash = await hashPassword(password);
    await prisma.user.create({ data: { name: normalizedName, email: normalizedEmail, passwordHash } });
    return Response.json({ ok: true }, { status: 201 });
  } catch (error) {
    if (error && typeof error === "object" && "code" in error && error.code === "P2002") {
      return Response.json({ error: "An account with that email already exists. Sign in instead." }, { status: 409 });
    }
    console.error("Manual account registration failed.", error instanceof Error ? error.name : "Unknown error");
    return Response.json({ error: "Account registration could not be completed. Check the database connection and try again." }, { status: 503 });
  }
}
