import { beforeEach, describe, expect, it, vi } from "vitest";

const { verifyIdToken } = vi.hoisted(() => ({ verifyIdToken: vi.fn() }));

// A class, not vi.fn(): google-auth.ts calls `new OAuth2Client(...)`, and an
// arrow function can't be constructed.
vi.mock("google-auth-library", () => ({
  OAuth2Client: class {
    verifyIdToken = verifyIdToken;
  },
}));

const { env } = await import("../../config/env.js");
const { MAX_CREDENTIAL_LENGTH, readGoogleCredential, verifyGoogleCredential } = await import("./google-auth.js");

const validPayload = {
  sub: "108124421234567890123",
  email: "Person@Example.com",
  email_verified: true,
  name: "A Person",
  picture: "https://example.com/avatar.png",
};

const ticketFor = (payload: unknown) => ({ getPayload: () => payload });

beforeEach(() => {
  verifyIdToken.mockReset();
});

describe("readGoogleCredential", () => {
  it("accepts a well-formed body", () => {
    expect(readGoogleCredential({ credential: "header.payload.signature" })).toEqual({
      ok: true,
      value: "header.payload.signature",
    });
  });

  it("rejects a non-object body", () => {
    expect(readGoogleCredential(null)).toEqual({
      ok: false,
      error: "Request body must be a JSON object.",
    });
    expect(readGoogleCredential("nope")).toEqual({
      ok: false,
      error: "Request body must be a JSON object.",
    });
  });

  it.each([
    ["missing", {}],
    ["empty", { credential: "" }],
    ["not a string", { credential: 12345 }],
  ])("rejects a credential that is %s", (_label, body) => {
    expect(readGoogleCredential(body)).toEqual({
      ok: false,
      error: "A `credential` string is required.",
    });
  });

  it("rejects a credential longer than MAX_CREDENTIAL_LENGTH", () => {
    const credential = "a".repeat(MAX_CREDENTIAL_LENGTH + 1);

    expect(readGoogleCredential({ credential })).toEqual({
      ok: false,
      error: "`credential` is not a valid Google ID token.",
    });
  });
});

describe("verifyGoogleCredential", () => {
  it("returns the profile and lowercases the email", async () => {
    verifyIdToken.mockResolvedValue(ticketFor(validPayload));

    expect(await verifyGoogleCredential("token")).toEqual({
      ok: true,
      value: {
        googleId: validPayload.sub,
        email: "person@example.com",
        name: "A Person",
        picture: "https://example.com/avatar.png",
      },
    });
  });

  // The audience check is the whole reason this can't be a plain jwt.decode:
  // without it, a token minted for any other Google client would pass.
  it("checks the token against this app's client ID", async () => {
    verifyIdToken.mockResolvedValue(ticketFor(validPayload));

    await verifyGoogleCredential("token");

    expect(verifyIdToken).toHaveBeenCalledWith({
      idToken: "token",
      audience: env.googleClientId,
    });
  });

  it("rejects a token whose signature, issuer, or audience fails", async () => {
    verifyIdToken.mockRejectedValue(new Error("Wrong recipient"));

    expect(await verifyGoogleCredential("token")).toEqual({ ok: false, error: "Google sign-in failed." });
  });

  it("rejects an unverified email", async () => {
    verifyIdToken.mockResolvedValue(ticketFor({ ...validPayload, email_verified: false }));

    expect(await verifyGoogleCredential("token")).toEqual({ ok: false, error: "Google sign-in failed." });
  });

  it.each([
    ["no payload", undefined],
    ["no sub", { ...validPayload, sub: undefined }],
    ["no email", { ...validPayload, email: undefined }],
  ])("rejects a token with %s", async (_label, payload) => {
    verifyIdToken.mockResolvedValue(ticketFor(payload));

    expect(await verifyGoogleCredential("token")).toEqual({ ok: false, error: "Google sign-in failed." });
  });

  it("defaults optional profile fields to null", async () => {
    verifyIdToken.mockResolvedValue(ticketFor({ ...validPayload, name: undefined, picture: undefined }));

    expect(await verifyGoogleCredential("token")).toEqual({
      ok: true,
      value: { googleId: validPayload.sub, email: "person@example.com", name: null, picture: null },
    });
  });
});
