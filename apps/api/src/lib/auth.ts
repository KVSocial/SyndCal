import argon2 from "argon2";
import { randomBytes, createHash } from "node:crypto";

export async function hashPassword(password: string) {
  return argon2.hash(password);
}

export async function verifyPassword(hash: string, password: string) {
  return argon2.verify(hash, password);
}

export function generateToken(length = 32) {
  return randomBytes(length).toString("hex");
}

export function hashToken(token: string) {
  return createHash("sha256").update(token).digest("hex");
}
