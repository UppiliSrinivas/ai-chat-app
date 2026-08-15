import { describe, expect, it } from "vitest";
import {
  SESSION_COOKIE_NAME,
  hashPassword,
  readSessionUserId,
  sessionCookieOptions,
  signSessionToken,
  verifyPassword,
  verifySessionToken,
} from "./auth.js";

describe("hashPassword / verifyPassword", () => {
  it("verifies the correct password against its own hash", async () => {
    const hash = await hashPassword("correct horse battery staple");

    await expect(verifyPassword("correct horse battery staple", hash)).resolves.toBe(true);
  });

  it("rejects an incorrect password", async () => {
    const hash = await hashPassword("correct horse battery staple");

    await expect(verifyPassword("wrong password", hash)).resolves.toBe(false);
  });

  it("never stores the password in plain text", async () => {
    const hash = await hashPassword("correct horse battery staple");

    expect(hash).not.toBe("correct horse battery staple");
  });
});

describe("signSessionToken / verifySessionToken", () => {
  it("round-trips the userId through a signed token", () => {
    const token = signSessionToken({ userId: "user-123" });

    expect(verifySessionToken(token)).toEqual({ userId: "user-123" });
  });

  it("returns null for a malformed token", () => {
    expect(verifySessionToken("not-a-real-token")).toBeNull();
  });

  it("returns null for a token signed with a different secret", () => {
    // A JWT with a valid shape but a signature verifySessionToken can't match.
    const foreignToken =
      "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJ1c2VySWQiOiJ1c2VyLTEyMyJ9.invalidsignature";

    expect(verifySessionToken(foreignToken)).toBeNull();
  });
});

describe("readSessionUserId", () => {
  it("returns the userId for a valid token", () => {
    const token = signSessionToken({ userId: "user-456" });

    expect(readSessionUserId(token)).toBe("user-456");
  });

  it("returns null for a non-string value", () => {
    expect(readSessionUserId(undefined)).toBeNull();
    expect(readSessionUserId(42)).toBeNull();
    expect(readSessionUserId(null)).toBeNull();
  });

  it("returns null for an invalid token string", () => {
    expect(readSessionUserId("garbage")).toBeNull();
  });
});

describe("sessionCookieOptions", () => {
  it("is httpOnly and sameSite=lax so it is unreachable from JS and survives cross-port dev requests", () => {
    expect(sessionCookieOptions.httpOnly).toBe(true);
    expect(sessionCookieOptions.sameSite).toBe("lax");
  });

  it("matches the documented 7-day maxAge", () => {
    expect(sessionCookieOptions.maxAge).toBe(7 * 24 * 60 * 60 * 1000);
  });

  it("exposes a stable cookie name shared by the routes that set and clear it", () => {
    expect(SESSION_COOKIE_NAME).toBe("session");
  });
});
