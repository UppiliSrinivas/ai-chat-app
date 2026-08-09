import type { NextFunction, Request, Response } from "express";
import { SESSION_COOKIE_NAME, readSessionUserId } from "../lib/auth.js";

// Augment Express's Request so downstream handlers get a typed req.userId
// instead of everyone re-reading and re-verifying the cookie themselves.
declare module "express-serve-static-core" {
  interface Request {
    userId?: string;
  }
}

export const requireAuth = (req: Request, res: Response, next: NextFunction): void => {
  const userId = readSessionUserId(req.cookies?.[SESSION_COOKIE_NAME]);

  if (!userId) {
    res.status(401).json({ message: "Not authenticated." });
    return;
  }

  req.userId = userId;
  next();
};
