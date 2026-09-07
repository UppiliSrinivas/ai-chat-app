/**
 * Validation for signup/login request bodies. Same shape as chat-request.ts:
 * pure, provider-agnostic, unit-testable without a server or a database.
 */

export const MIN_PASSWORD_LENGTH = 8;
export const MAX_PASSWORD_LENGTH = 256;
export const MAX_EMAIL_LENGTH = 254; // RFC 5321 mailbox length limit

export interface Credentials {
  email: string;
  password: string;
}

export type ValidationResult =
  | { ok: true; value: Credentials }
  | { ok: false; error: string };

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

// Deliberately simple: format-check only, not a full RFC 5322 validator.
// The real check that an address is reachable is the verification email
// this app doesn't send yet — this just rejects obvious junk early.
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export const validateCredentials = (body: unknown): ValidationResult => {
  if (!isRecord(body)) {
    return { ok: false, error: "Request body must be a JSON object." };
  }

  const { email, password } = body;

  if (typeof email !== "string" || !EMAIL_PATTERN.test(email) || email.length > MAX_EMAIL_LENGTH) {
    return { ok: false, error: "A valid `email` is required." };
  }

  if (typeof password !== "string" || password.length < MIN_PASSWORD_LENGTH) {
    return { ok: false, error: `\`password\` must be at least ${MIN_PASSWORD_LENGTH} characters.` };
  }

  if (password.length > MAX_PASSWORD_LENGTH) {
    return { ok: false, error: `\`password\` is limited to ${MAX_PASSWORD_LENGTH} characters.` };
  }

  return { ok: true, value: { email: email.trim().toLowerCase(), password } };
};
