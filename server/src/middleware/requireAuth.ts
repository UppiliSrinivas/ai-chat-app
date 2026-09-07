import type { NextFunction, Request, Response } from "express";
import { SESSION_COOKIE_NAME, readBearerToken, readSessionUserId } from "../lib/auth/auth.js";

// Augment Express's Request so downstream handlers get a typed req.userId
// instead of everyone re-reading and re-verifying the cookie themselves.
declare module "express-serve-static-core" {
  interface Request {
    userId?: string;
  }
}

export const requireAuth = (req: Request, res: Response, next: NextFunction): void => {
  // Cookie first — that is the browser's session, and it is httpOnly precisely
  // so the page's own JS cannot read it. A native client has no such jar and
  // sends the identical JWT as a bearer token.
  const userId =
    readSessionUserId(req.cookies?.[SESSION_COOKIE_NAME]) ??
    readSessionUserId(readBearerToken(req.headers.authorization));

  if (!userId) {
    res.status(401).json({ message: "Not authenticated." });
    return;
  }

  req.userId = userId;
  next();
};
