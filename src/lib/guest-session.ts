import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import { cookies } from "next/headers";

const COOKIE = "iium_guest";
const MAX_AGE = 30 * 24 * 60 * 60;
const globalGuestSecret = globalThis as typeof globalThis & { __iiumGuestDevSecret?: string };
if (!process.env.AUTH_SECRET && process.env.NODE_ENV !== "production") globalGuestSecret.__iiumGuestDevSecret ??= randomBytes(32).toString("base64url");
function sign(value: string) {
  const secret = process.env.AUTH_SECRET || (process.env.NODE_ENV !== "production" ? globalGuestSecret.__iiumGuestDevSecret : undefined);
  if (!secret) throw new Error("AUTH_SECRET is required to create guest sessions.");
  return createHmac("sha256", secret).update(value).digest("base64url");
}
export function verifyGuestToken(token: string | undefined) {
  if (!token) return null;
  const [id, expiry, signature] = token.split(".");
  if (!id || !expiry || !signature || Number(expiry) <= Date.now()) return null;
  const body = `${id}.${expiry}`;
  const expected = Buffer.from(sign(body));
  const actual = Buffer.from(signature);
  return expected.length === actual.length && timingSafeEqual(expected, actual) ? { id, expiresAt: Number(expiry) } : null;
}
export async function getGuestSession() {
  const jar = await cookies();
  return verifyGuestToken(jar.get(COOKIE)?.value);
}
export async function createGuestCookie() {
  const jar = await cookies();
  const id = crypto.randomUUID();
  const expiresAt = Date.now() + MAX_AGE * 1000;
  const body = `${id}.${expiresAt}`;
  jar.set(COOKIE, `${body}.${sign(body)}`, { httpOnly: true, secure: process.env.NODE_ENV === "production", sameSite: "lax", path: "/", maxAge: MAX_AGE });
  return { id, expiresAt };
}
export async function clearGuestCookie() {
  const jar = await cookies();
  jar.delete(COOKIE);
}
