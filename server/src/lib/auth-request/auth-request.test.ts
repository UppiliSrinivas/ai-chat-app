import { describe, expect, it } from "vitest";
import { MAX_EMAIL_LENGTH, MAX_PASSWORD_LENGTH, MIN_PASSWORD_LENGTH, validateCredentials } from "./auth-request.js";

describe("validateCredentials", () => {
  it("accepts well-formed credentials and lowercases the email", () => {
    const result = validateCredentials({ email: "Person@Example.com", password: "hunter22" });

    expect(result).toEqual({ ok: true, value: { email: "person@example.com", password: "hunter22" } });
  });

  it("rejects a non-object body", () => {
    expect(validateCredentials(null)).toEqual({
      ok: false,
      error: "Request body must be a JSON object.",
    });
    expect(validateCredentials("nope")).toEqual({
      ok: false,
      error: "Request body must be a JSON object.",
    });
  });

  it.each([
    ["missing @", "personexample.com"],
    ["missing domain", "person@"],
    ["missing local part", "@example.com"],
    ["contains whitespace", "person @example.com"],
    ["missing TLD dot", "person@examplecom"],
  ])("rejects an email that is %s", (_label, email) => {
    expect(validateCredentials({ email, password: "hunter22" })).toEqual({
      ok: false,
      error: "A valid `email` is required.",
    });
  });

  it("rejects a non-string email", () => {
    expect(validateCredentials({ email: 123, password: "hunter22" })).toEqual({
      ok: false,
      error: "A valid `email` is required.",
    });
  });

  it("rejects an email longer than MAX_EMAIL_LENGTH", () => {
    const local = "a".repeat(MAX_EMAIL_LENGTH);
    const email = `${local}@example.com`;

    expect(validateCredentials({ email, password: "hunter22" })).toEqual({
      ok: false,
      error: "A valid `email` is required.",
    });
  });

  it("rejects a password shorter than MIN_PASSWORD_LENGTH", () => {
    const password = "a".repeat(MIN_PASSWORD_LENGTH - 1);

    expect(validateCredentials({ email: "person@example.com", password })).toEqual({
      ok: false,
      error: `\`password\` must be at least ${MIN_PASSWORD_LENGTH} characters.`,
    });
  });

  it("rejects a non-string password", () => {
    expect(validateCredentials({ email: "person@example.com", password: 12345678 })).toEqual({
      ok: false,
      error: `\`password\` must be at least ${MIN_PASSWORD_LENGTH} characters.`,
    });
  });

  it("rejects a password longer than MAX_PASSWORD_LENGTH", () => {
    const password = "a".repeat(MAX_PASSWORD_LENGTH + 1);

    expect(validateCredentials({ email: "person@example.com", password })).toEqual({
      ok: false,
      error: `\`password\` is limited to ${MAX_PASSWORD_LENGTH} characters.`,
    });
  });

  it("accepts a password exactly at the length boundaries", () => {
    const minPassword = "a".repeat(MIN_PASSWORD_LENGTH);
    const maxPassword = "a".repeat(MAX_PASSWORD_LENGTH);

    expect(validateCredentials({ email: "person@example.com", password: minPassword })).toEqual({
      ok: true,
      value: { email: "person@example.com", password: minPassword },
    });
    expect(validateCredentials({ email: "person@example.com", password: maxPassword })).toEqual({
      ok: true,
      value: { email: "person@example.com", password: maxPassword },
    });
  });
});
