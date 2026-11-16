import { randomBytes, scrypt as scryptCallback, timingSafeEqual } from "node:crypto";
import { promisify } from "node:util";

const scrypt = promisify(scryptCallback);
const KEY_LENGTH = 64;

export async function hashPassword(password: string) {
  const salt = randomBytes(16).toString("hex");
  const key = await scrypt(password, salt, KEY_LENGTH) as Buffer;
  return `scrypt:${salt}:${key.toString("hex")}`;
}

export async function verifyPassword(password: string, encoded: string) {
  const [algorithm, salt, stored] = encoded.split(":");
  if (algorithm !== "scrypt" || !salt || !stored || !/^[a-f0-9]{128}$/i.test(stored)) return false;
  const actual = await scrypt(password, salt, KEY_LENGTH) as Buffer;
  return timingSafeEqual(actual, Buffer.from(stored, "hex"));
}
