import { auth } from "../../../../../auth";
import { prisma } from "@/lib/prisma";

export async function PATCH(request: Request) {
  const session = await auth();
  if (!session?.user?.id) return Response.json({ error: "Sign in to update preferences." }, { status: 401 });
  let body: unknown;
  try { body = await request.json(); } catch { return Response.json({ error: "Invalid request." }, { status: 400 }); }
  if (!body || typeof body !== "object") return Response.json({ error: "Invalid request." }, { status: 400 });
  const { theme, language } = body as Record<string, unknown>;
  if (!(["system", "light", "dark"].includes(String(theme)) && ["en", "ms", "ar"].includes(String(language)))) return Response.json({ error: "Unsupported preference." }, { status: 400 });
  await prisma.user.update({ where: { id: session.user.id }, data: { theme: String(theme), language: String(language) } });
  return Response.json({ ok: true });
}
