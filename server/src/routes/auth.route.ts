import { Router } from "express";
import { User, type UserDoc } from "../models/User.js";
import { validateCredentials } from "../lib/auth-request.js";
import {
  hashPassword,
  verifyPassword,
  signSessionToken,
  readSessionUserId,
  SESSION_COOKIE_NAME,
  sessionCookieOptions,
} from "../lib/auth.js";
import { requireAuth } from "../middleware/requireAuth.js";

const router = Router();

// Shared shape for every route that returns a user, so the client sees the
// same fields regardless of which auth method created it.
const toUserResponse = (user: UserDoc & { id: string }) => ({
  id: user.id,
  email: user.email ?? null,
  isAnonymous: Boolean(user.isAnonymous),
});

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
  res.status(201).json(toUserResponse(user));
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
  res.json(toUserResponse(user));
});

// No credentials, no body — just mints a guest identity so someone can start
// chatting immediately. Chat history persists under this user like any
// other; signup (above) upgrades this same document in place if the guest
// later creates a real account, so nothing is lost. Logging into a
// *different*, pre-existing account still leaves the guest's chats behind —
// merging across two different accounts isn't handled.
router.post("/anonymous", async (_req, res) => {
  const user = await User.create({ isAnonymous: true });

  const token = signSessionToken({ userId: user.id });
  res.cookie(SESSION_COOKIE_NAME, token, sessionCookieOptions);
  res.status(201).json(toUserResponse(user));
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
