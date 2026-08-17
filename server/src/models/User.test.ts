import { describe, expect, it } from "vitest";
import { User } from "./User.js";

// validateSync runs the schema without a database connection, so these assert
// the shape the routes rely on without needing a live Mongo.
describe("User schema", () => {
  it("accepts an anonymous user with no email or password", () => {
    const user = new User({ isAnonymous: true });

    expect(user.validateSync()).toBeUndefined();
    expect(user.email).toBeUndefined();
    expect(user.passwordHash).toBeUndefined();
  });

  it("defaults isAnonymous to false", () => {
    expect(new User({ email: "person@example.com" }).isAnonymous).toBe(false);
  });

  // Login looks accounts up by the address the user typed, so storage has to
  // be case-insensitive or "Person@" and "person@" become two accounts.
  it("lowercases and trims the email", () => {
    const user = new User({ email: "  Person@Example.COM  " });

    expect(user.email).toBe("person@example.com");
  });

  it("accepts a Google-linked account with no password", () => {
    const user = new User({ email: "person@example.com", googleId: "108124421234567890123" });

    expect(user.validateSync()).toBeUndefined();
    expect(user.passwordHash).toBeUndefined();
  });

  it("accepts a password account with no googleId", () => {
    const user = new User({ email: "person@example.com", passwordHash: "hash" });

    expect(user.validateSync()).toBeUndefined();
    expect(user.googleId).toBeUndefined();
  });

  it("timestamps every document", () => {
    expect(User.schema.get("timestamps")).toBe(true);
  });

  // Both are sparse so many anonymous users can omit them without colliding
  // on the unique index — the single most load-bearing detail in this schema.
  it.each(["email", "googleId"])("indexes %s as unique and sparse", (field) => {
    const path = User.schema.path(field);

    expect(path.options.unique).toBe(true);
    expect(path.options.sparse).toBe(true);
  });
});
