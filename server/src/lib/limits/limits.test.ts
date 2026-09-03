import { describe, expect, it } from "vitest";
import {
  MAX_CHATS_PER_PROJECT,
  MAX_MESSAGES_PER_CHAT,
  isChatFull,
  isProjectFull,
} from "./limits.js";

describe("isChatFull", () => {
  it("allows a chat below the cap", () => {
    expect(isChatFull(MAX_MESSAGES_PER_CHAT - 1)).toBe(false);
  });

  // The cap is inclusive: at exactly 50 stored messages the chat is done,
  // because the next send would write the 51st.
  it("is full at exactly the cap", () => {
    expect(isChatFull(MAX_MESSAGES_PER_CHAT)).toBe(true);
  });

  it("stays full past the cap", () => {
    expect(isChatFull(MAX_MESSAGES_PER_CHAT + 5)).toBe(true);
  });

  it("allows an empty chat", () => {
    expect(isChatFull(0)).toBe(false);
  });
});

describe("isProjectFull", () => {
  it("allows a project below the cap", () => {
    expect(isProjectFull(MAX_CHATS_PER_PROJECT - 1)).toBe(false);
  });

  it("is full at exactly the cap", () => {
    expect(isProjectFull(MAX_CHATS_PER_PROJECT)).toBe(true);
  });

  it("allows an empty project", () => {
    expect(isProjectFull(0)).toBe(false);
  });
});

describe("limit values", () => {
  it("matches the values the client and docs assume", () => {
    expect(MAX_MESSAGES_PER_CHAT).toBe(50);
    expect(MAX_CHATS_PER_PROJECT).toBe(10);
  });
});
