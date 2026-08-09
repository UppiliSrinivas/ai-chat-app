import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import { env } from "../config/env.js";

/**
 * Password hashing and session-token helpers. Kept separate from the routes
 * that use them, same reasoning as chat-request.ts / history.ts: small, pure
 * surfaces are easy to unit test and reuse without a server running.
 */

const SALT_ROUNDS = 12;

export const hashPassword = (password: string): Promise<string> => bcrypt.hash(password, SALT_ROUNDS);

export const verifyPassword = (password: string, hash: string): Promise<boolean> => bcrypt.compare(password, hash);

export interface SessionPayload {
  userId: string;
}

export const signSessionToken = (payload: SessionPayload): string =>
  jwt.sign(payload, env.jwtSecret, { expiresIn: env.jwtExpiresIn as jwt.SignOptions["expiresIn"] });

export const verifySessionToken = (token: string): SessionPayload | null => {
  try {
    const decoded = jwt.verify(token, env.jwtSecret);
    if (typeof decoded === "object" && decoded !== null && typeof decoded.userId === "string") {
      return { userId: decoded.userId };
    }
    return null;
  } catch {
    return null;
  }
};

/** Pulls the userId out of a session cookie value, or null for anything
 *  missing/invalid. Shared by requireAuth and signup's guest-linking check
 *  so "how do we read the current session" only has one answer. */
export const readSessionUserId = (token: unknown): string | null => {
  if (typeof token !== "string") return null;
  return verifySessionToken(token)?.userId ?? null;
};

/** Name and options for the session cookie, shared between the routes that
 *  set it (login/signup) and the ones that clear it (logout), so they can
 *  never drift out of sync. */
export const SESSION_COOKIE_NAME = "session";

export const sessionCookieOptions = {
  httpOnly: true,
  sameSite: "lax" as const,
  // Cookie domain-matching ignores port, so this works across the dev
  // client (5173) and API (5000) on localhost without being "none" + insecure.
  secure: env.nodeEnv === "production",
  maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days; keep in sync with jwtExpiresIn
};
