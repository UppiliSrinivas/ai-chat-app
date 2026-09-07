import type { Request } from "express";
import { describe, expect, it } from "vitest";
import { authLimiter, chatKey, chatLimiter } from "./rateLimit.js";

describe("chatKey", () => {
  // Keyed on the user, not the IP, so an office or NAT doesn't share a budget.
  it("prefers the signed-in user over the address", () => {
    expect(chatKey({ userId: "user-1", ip: "1.2.3.4" } as Request)).toBe("user-1");
  });

  it("falls back to the address when there is no user", () => {
    expect(chatKey({ ip: "1.2.3.4" } as Request)).toBe("1.2.3.4");
  });

  // A client with an IPv6 prefix could otherwise rotate addresses to reset
  // its own counter, so the key has to collapse to the /64 subnet.
  it("collapses an IPv6 address to its subnet", () => {
    const key = chatKey({ ip: "2001:db8::1" } as Request);

    expect(key).not.toBe("2001:db8::1");
    expect(key).toMatch(/\/\d+$/);
  });

  it("gives two addresses in one IPv6 prefix the same key", () => {
    expect(chatKey({ ip: "2001:db8::1" } as Request)).toBe(chatKey({ ip: "2001:db8::99" } as Request));
  });

  it("does not throw when the address is missing", () => {
    expect(() => chatKey({} as Request)).not.toThrow();
  });
});

describe("limiters", () => {
  it("exports middleware for both throttled surfaces", () => {
    expect(typeof authLimiter).toBe("function");
    expect(typeof chatLimiter).toBe("function");
  });
});
