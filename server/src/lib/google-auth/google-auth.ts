import { OAuth2Client } from "google-auth-library";
import { env } from "../../config/env.js";

/**
 * Verification for the ID token @react-oauth/google hands the client. Split
 * in two like auth-request.ts: the shape check stays pure and unit-testable,
 * and only the signature check needs Google.
 */

// Google ID tokens run ~1–2KB. Anything far past that isn't worth a network
// round-trip to reject.
export const MAX_CREDENTIAL_LENGTH = 4096;

export interface GoogleProfile {
  googleId: string;
  email: string;
  name: string | null;
  picture: string | null;
}

export type CredentialResult = { ok: true; value: string } | { ok: false; error: string };

export type GoogleVerifyResult = { ok: true; value: GoogleProfile } | { ok: false; error: string };

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

export const readGoogleCredential = (body: unknown): CredentialResult => {
  if (!isRecord(body)) {
    return { ok: false, error: "Request body must be a JSON object." };
  }

  const { credential } = body;

  if (typeof credential !== "string" || credential.length === 0) {
    return { ok: false, error: "A `credential` string is required." };
  }

  if (credential.length > MAX_CREDENTIAL_LENGTH) {
    return { ok: false, error: "`credential` is not a valid Google ID token." };
  }

  return { ok: true, value: credential };
};

// One client per process — it caches Google's public signing keys, so sharing
// it avoids refetching the key set on every sign-in.
const client = new OAuth2Client(env.googleClientId);

/** One message for every failure mode. Which claim was wrong helps someone
 *  probing the endpoint and tells a real user nothing they can act on. */
const invalid: GoogleVerifyResult = { ok: false, error: "Google sign-in failed." };

export const verifyGoogleCredential = async (credential: string): Promise<GoogleVerifyResult> => {
  let payload;

  try {
    // `audience` is what ties the token to this app. Omit it and a token minted
    // for any other Google client verifies here just as happily.
    const ticket = await client.verifyIdToken({ idToken: credential, audience: env.googleClientId });
    payload = ticket.getPayload();
  } catch {
    return invalid;
  }

  if (!payload?.sub || !payload.email) {
    return invalid;
  }

  // An unverified address is one Google never confirmed the holder owns, so
  // matching it against an existing account would hand that account away.
  if (!payload.email_verified) {
    return invalid;
  }

  return {
    ok: true,
    value: {
      googleId: payload.sub,
      email: payload.email.trim().toLowerCase(),
      name: payload.name ?? null,
      picture: payload.picture ?? null,
    },
  };
};
