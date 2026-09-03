import { describe, expect, it } from "vitest";
import {
  MAX_ACTIVE_TOKENS,
  MAX_CHATS_PER_PROJECT,
  MAX_CHAT_TOKENS,
  MAX_PROJECTS_PER_DAY,
  isChatFull,
  isDailyProjectLimitReached,
  isProjectFull,
  isSummaryDue,
  startOfUtcDay,
} from "./limits.js";

// The chat cap counts everything ever stored, not what gets sent. Compaction
// keeps the sent total flat, so a limit on the sent total would never fire.
describe("isChatFull", () => {
  it("allows a chat below the cap", () => {
    expect(isChatFull(MAX_CHAT_TOKENS - 1)).toBe(false);
  });

  it("is full at exactly the cap", () => {
    expect(isChatFull(MAX_CHAT_TOKENS)).toBe(true);
  });

  it("stays full past the cap", () => {
    expect(isChatFull(MAX_CHAT_TOKENS + 5000)).toBe(true);
  });

  it("allows an empty chat", () => {
    expect(isChatFull(0)).toBe(false);
  });
});

describe("isSummaryDue", () => {
  it("waits below the active threshold", () => {
    expect(isSummaryDue(MAX_ACTIVE_TOKENS - 1)).toBe(false);
  });

  it("fires at exactly the threshold", () => {
    expect(isSummaryDue(MAX_ACTIVE_TOKENS)).toBe(true);
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

// Abuse protection rather than a size cap: the count is of projects created
// today, so it frees up tomorrow rather than when something is deleted.
describe("isDailyProjectLimitReached", () => {
  it("allows a user below today's allowance", () => {
    expect(isDailyProjectLimitReached(MAX_PROJECTS_PER_DAY - 1)).toBe(false);
  });

  it("blocks at exactly the allowance", () => {
    expect(isDailyProjectLimitReached(MAX_PROJECTS_PER_DAY)).toBe(true);
  });

  it("allows a user who has created none today", () => {
    expect(isDailyProjectLimitReached(0)).toBe(false);
  });
});

describe("limit values", () => {
  it("matches the values the client and docs assume", () => {
    expect(MAX_CHAT_TOKENS).toBe(20_000);
    expect(MAX_ACTIVE_TOKENS).toBe(4_000);
    expect(MAX_CHATS_PER_PROJECT).toBe(5);
    expect(MAX_PROJECTS_PER_DAY).toBe(5);
  });

  // A summary that could reach the trigger on its own would summarize forever.
  it("keeps the summary well clear of the trigger it feeds", () => {
    expect(MAX_ACTIVE_TOKENS).toBeGreaterThan(400 * 2);
  });
});

// The daily allowance needs a boundary, and UTC is the only one that does not
// move under a user who travels or a server that changes region.
describe("startOfUtcDay", () => {
  it("winds back to midnight UTC", () => {
    expect(startOfUtcDay(new Date("2026-09-01T14:37:12.456Z")).toISOString()).toBe("2026-09-01T00:00:00.000Z");
  });

  it("leaves a moment already at midnight alone", () => {
    expect(startOfUtcDay(new Date("2026-09-01T00:00:00.000Z")).toISOString()).toBe("2026-09-01T00:00:00.000Z");
  });

  // Late-evening UTC still belongs to the day it is in, not the next one.
  it("does not roll into tomorrow late in the day", () => {
    expect(startOfUtcDay(new Date("2026-09-01T23:59:59.999Z")).toISOString()).toBe("2026-09-01T00:00:00.000Z");
  });
});
