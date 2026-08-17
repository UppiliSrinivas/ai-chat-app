import type { NextFunction, Request, Response } from "express";
import { describe, expect, it, vi } from "vitest";
import { requireAuth } from "./requireAuth.js";
import { SESSION_COOKIE_NAME, signSessionToken } from "../lib/auth/auth.js";

const fakeRes = () => {
  const res = {
    statusCode: 0,
    body: null as unknown,
    status(code: number) {
      res.statusCode = code;
      return res;
    },
    json(payload: unknown) {
      res.body = payload;
      return res;
    },
  };
  return res;
};

const run = (cookies?: Record<string, string>) => {
  const req = { cookies } as Request;
  const res = fakeRes();
  const next = vi.fn() as unknown as NextFunction;

  requireAuth(req, res as unknown as Response, next);

  return { req, res, next };
};

describe("requireAuth", () => {
  it("attaches the userId and continues for a valid session", () => {
    const token = signSessionToken({ userId: "507f1f77bcf86cd799439011" });

    const { req, res, next } = run({ [SESSION_COOKIE_NAME]: token });

    expect(req.userId).toBe("507f1f77bcf86cd799439011");
    expect(next).toHaveBeenCalledOnce();
    expect(res.statusCode).toBe(0);
  });

  it("rejects a request with no cookies at all", () => {
    const { req, res, next } = run(undefined);

    expect(res.statusCode).toBe(401);
    expect(res.body).toEqual({ message: "Not authenticated." });
    expect(next).not.toHaveBeenCalled();
    expect(req.userId).toBeUndefined();
  });

  it("rejects a request missing the session cookie", () => {
    const { res, next } = run({ somethingElse: "value" });

    expect(res.statusCode).toBe(401);
    expect(next).not.toHaveBeenCalled();
  });

  // A tampered or expired token must be indistinguishable from no token —
  // verification failing is exactly the case this guard exists for.
  it("rejects a token that fails verification", () => {
    const { res, next } = run({ [SESSION_COOKIE_NAME]: "not.a.jwt" });

    expect(res.statusCode).toBe(401);
    expect(next).not.toHaveBeenCalled();
  });

  it("rejects a token signed with a different secret", () => {
    const forged =
      "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJ1c2VySWQiOiJoYWNrZXIifQ.wrongsignature";

    const { res, next } = run({ [SESSION_COOKIE_NAME]: forged });

    expect(res.statusCode).toBe(401);
    expect(next).not.toHaveBeenCalled();
  });
});
