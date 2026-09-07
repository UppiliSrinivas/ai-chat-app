import { Router, type Request } from "express";
import { isGoogleConfigured } from "../config/env.js";
import { User, type UserDoc } from "../models/User.js";
import { validateCredentials } from "../lib/auth-request/auth-request.js";
import { readGoogleCredential, verifyGoogleCredential } from "../lib/google-auth/google-auth.js";
import {
  hashPassword,
  verifyPassword,
  signSessionToken,
  readSessionUserId,
  SESSION_COOKIE_NAME,
  sessionCookieOptions,
} from "../lib/auth/auth.js";
import { requireAuth } from "../middleware/requireAuth.js";
import { authLimiter } from "../middleware/rateLimit.js";

const router = Router();

// Throttles every sign-in route below. /me is a plain read and stays exempt —
// the client polls it on each load to decide what to render.
router.post("*splat", authLimiter);

// Shared shape for every route that returns a user, so the client sees the
// same fields regardless of which auth method created it.
const toUserResponse = (user: UserDoc & { id: string }) => ({
  id: user.id,
  email: user.email ?? null,
  isAnonymous: Boolean(user.isAnonymous),
});

/** The session normally rides in an httpOnly cookie so the browser's own JS can
 *  never read it. A native client has no cookie jar, so it asks for the token in
 *  the body — and only a request that identifies itself as one gets it back. */
const sessionResponse = (req: Request, user: UserDoc & { id: string }, token: string) => {
  const body = toUserResponse(user);
  return req.get("X-Client") === "mobile" ? { ...body, token } : body;
};

router.post("/signup", async (req, res) => {
  const parsed = validateCredentials(req.body);
  if (!parsed.ok) {
    res.status(400).json({ message: parsed.error });
    return;
  }

  const { email, password } = parsed.value;

  const existing = await User.findOne({ email });
  if (existing) {
    // Same message as "wrong password" would get is intentionally avoided
    // here: signup is a different flow from login, and account enumeration
    // via signup is a lesser concern than a confusing UX. Login, below,
    // does collapse the two cases.
    res.status(409).json({ message: "An account with that email already exists." });
    return;
  }

  const passwordHash = await hashPassword(password);

  // If the visitor already holds a guest session, upgrade that same user
  // document in place instead of creating a second, disconnected one — every
  // chat is scoped to this _id, so it carries over automatically. A session
  // belonging to a non-anonymous user is deliberately ignored here: signing
  // up while already logged into a real account must never overwrite it.
  const sessionUserId = readSessionUserId(req.cookies?.[SESSION_COOKIE_NAME]);
  const guest = sessionUserId ? await User.findOne({ _id: sessionUserId, isAnonymous: true }) : null;

  let user: UserDoc & { id: string };
  if (guest) {
    guest.email = email;
    guest.passwordHash = passwordHash;
    guest.isAnonymous = false;
    await guest.save();
    user = guest;
  } else {
    user = await User.create({ email, passwordHash });
  }

  const token = signSessionToken({ userId: user.id });
  res.cookie(SESSION_COOKIE_NAME, token, sessionCookieOptions);
  res.status(201).json(sessionResponse(req, user, token));
});

router.post("/login", async (req, res) => {
  const parsed = validateCredentials(req.body);
  if (!parsed.ok) {
    res.status(400).json({ message: parsed.error });
    return;
  }

  const { email, password } = parsed.value;

  const user = await User.findOne({ email });
  // Deliberately identical error for every failure mode below — distinguishing
  // "no such user" from "wrong password" from "this account has no password"
  // (an anonymous-only account) would let an attacker enumerate accounts.
  const invalidCredentials = () => res.status(401).json({ message: "Invalid email or password." });

  if (!user || !user.passwordHash) {
    invalidCredentials();
    return;
  }

  const valid = await verifyPassword(password, user.passwordHash);
  if (!valid) {
    invalidCredentials();
    return;
  }

  const token = signSessionToken({ userId: user.id });
  res.cookie(SESSION_COOKIE_NAME, token, sessionCookieOptions);
  res.json(sessionResponse(req, user, token));
});

// No credentials, no body — just mints a guest identity so someone can start
// chatting immediately. Chat history persists under this user like any
// other; signup (above) upgrades this same document in place if the guest
// later creates a real account, so nothing is lost. Logging into a
// *different*, pre-existing account still leaves the guest's chats behind —
// merging across two different accounts isn't handled.
router.post("/anonymous", async (req, res) => {
  const user = await User.create({ isAnonymous: true });

  const token = signSessionToken({ userId: user.id });
  res.cookie(SESSION_COOKIE_NAME, token, sessionCookieOptions);
  res.status(201).json(sessionResponse(req, user, token));
});

// Takes the ID token @react-oauth/google returns in its `credential` field.
// That token is verified against Google's public keys rather than decoded —
// decoding alone would let anyone forge a payload claiming any email.
router.post("/google", async (req, res) => {
  // Same 503-not-500 stance as the Gemini routes: an unconfigured provider is
  // a server problem, and the client can fall back to another sign-in method.
  if (!isGoogleConfigured) {
    res.status(503).json({ message: "Google sign-in is not configured on the server." });
    return;
  }

  const parsed = readGoogleCredential(req.body);
  if (!parsed.ok) {
    res.status(400).json({ message: parsed.error });
    return;
  }

  const verified = await verifyGoogleCredential(parsed.value);
  if (!verified.ok) {
    res.status(401).json({ message: verified.error });
    return;
  }

  const { googleId, email } = verified.value;

  let user: (UserDoc & { id: string }) | null = await User.findOne({ googleId });

  if (!user) {
    // A password account on the same address gets linked rather than colliding
    // with the unique email index. Safe only because email_verified was
    // checked above — Google confirmed this person owns the address.
    const byEmail = await User.findOne({ email });
    if (byEmail) {
      byEmail.googleId = googleId;
      await byEmail.save();
      user = byEmail;
    }
  }

  if (!user) {
    // Same guest-upgrade rule as /signup: a guest session becomes this account
    // in place so its chats carry over, but a real session is never replaced.
    const sessionUserId = readSessionUserId(req.cookies?.[SESSION_COOKIE_NAME]);
    const guest = sessionUserId ? await User.findOne({ _id: sessionUserId, isAnonymous: true }) : null;

    if (guest) {
      guest.googleId = googleId;
      guest.email = email;
      guest.isAnonymous = false;
      await guest.save();
      user = guest;
    } else {
      user = await User.create({ googleId, email, isAnonymous: false });
    }
  }

  const token = signSessionToken({ userId: user.id });
  res.cookie(SESSION_COOKIE_NAME, token, sessionCookieOptions);
  res.json(sessionResponse(req, user, token));
});

router.post("/logout", (_req, res) => {
  res.clearCookie(SESSION_COOKIE_NAME, sessionCookieOptions);
  res.status(204).end();
});

router.get("/me", requireAuth, async (req, res) => {
  const user = await User.findById(req.userId).select("email isAnonymous");
  if (!user) {
    res.status(401).json({ message: "Not authenticated." });
    return;
  }
  res.json(toUserResponse(user));
});

export default router;
