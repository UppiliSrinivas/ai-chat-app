import type { NextFunction, Request, Response } from "express";

/**
 * Last-resort handler. Express 5 forwards async route rejections here
 * automatically; without it they reach Express's default handler, which ships
 * the stack trace to the client whenever NODE_ENV isn't "production".
 */
export const notFound = (_req: Request, res: Response): void => {
  res.status(404).json({ message: "Not found." });
};

// Mongo's unique index surfaces as code 11000. Racing writers on the same
// email hit this even though the route's own findOne check passed.
const isDuplicateKey = (error: unknown): boolean =>
  typeof error === "object" && error !== null && (error as { code?: number }).code === 11000;

export const errorHandler = (
  error: unknown,
  _req: Request,
  res: Response,
  next: NextFunction,
): void => {
  // Headers already sent means a response is mid-flight — an SSE stream, most
  // likely. Express's default handler is the only thing that can kill the
  // socket cleanly at that point.
  if (res.headersSent) {
    next(error);
    return;
  }

  if (isDuplicateKey(error)) {
    res.status(409).json({ message: "That account already exists." });
    return;
  }

  console.error("[error]", error);
  res.status(500).json({ message: "Something went wrong." });
};
