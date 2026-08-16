import { ipKeyGenerator, rateLimit } from "express-rate-limit";
import type { Request } from "express";

/**
 * Per-IP throttles on the two endpoints that cost something real: sign-in
 * routes write a User document, and the chat route spends the Gemini key.
 * CORS restricts browser origins but does nothing against a direct curl, so
 * this is the only thing standing between a public URL and someone else
 * draining the quota.
 */

const tooMany = { message: "Too many requests. Please try again shortly." };

/** Covers signup/login/anonymous/google. Anonymous is the strictest case —
 *  it needs no credentials at all and creates a row per call. */
export const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 20,
  standardHeaders: "draft-7",
  legacyHeaders: false,
  message: tooMany,
});

// Keyed on the signed-in user rather than the IP, so one office or NAT
// doesn't share a single budget. Mounted after requireAuth, so req.userId is
// always set; the IP fallback only matters if that order ever changes.
// ipKeyGenerator normalises IPv6 into a /64 subnet — a single client can
// otherwise rotate through addresses in its own prefix to reset the counter.
const chatKey = (req: Request): string => req.userId ?? ipKeyGenerator(req.ip ?? "");

export const chatLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 40,
  standardHeaders: "draft-7",
  legacyHeaders: false,
  keyGenerator: chatKey,
  message: tooMany,
});
