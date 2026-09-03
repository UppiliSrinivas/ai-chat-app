import { describe, expect, it } from "vitest";
import { estimateTokens, sumTokens } from "./tokens.js";

describe("estimateTokens", () => {
  it("counts nothing for empty text", () => {
    expect(estimateTokens("")).toBe(0);
  });

  // Roughly four characters per token. Only ever used where the API cannot
  // price the text for us, so being a little off shifts when we summarize
  // rather than breaking anything.
  it("scales with length", () => {
    expect(estimateTokens("a".repeat(400))).toBe(100);
  });

  // A short message still costs something; rounding it to zero would let a
  // long run of them look free.
  it("never rounds a non-empty message down to nothing", () => {
    expect(estimateTokens("hi")).toBeGreaterThan(0);
  });
});

describe("sumTokens", () => {
  it("is zero for no messages", () => {
    expect(sumTokens([])).toBe(0);
  });

  // The exact count from the API is preferred wherever we have one.
  it("prefers a stored count over the estimate", () => {
    expect(sumTokens([{ content: "a".repeat(400), tokens: 7 }])).toBe(7);
  });

  it("falls back to the estimate when a message was never priced", () => {
    expect(sumTokens([{ content: "a".repeat(400) }])).toBe(100);
  });

  it("adds a mixed list", () => {
    expect(sumTokens([{ content: "a".repeat(400), tokens: 7 }, { content: "a".repeat(400) }])).toBe(107);
  });

  // A zero from the API is a real answer, not a missing one.
  it("treats a stored zero as priced", () => {
    expect(sumTokens([{ content: "a".repeat(400), tokens: 0 }])).toBe(0);
  });
});
