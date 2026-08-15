import { describe, expect, it } from "vitest";
import {
  MAX_HISTORY_CHARS,
  MAX_HISTORY_TURNS,
  MAX_MESSAGE_CHARS,
  validateChatMessageRequest,
  windowHistory,
  type HistoryTurn,
} from "./chat-request.js";

describe("windowHistory", () => {
  it("returns the input unchanged when it fits both budgets", () => {
    const history: HistoryTurn[] = [
      { role: "user", content: "hi" },
      { role: "assistant", content: "hello" },
    ];

    expect(windowHistory(history)).toEqual(history);
  });

  it("keeps only the most recent MAX_HISTORY_TURNS turns", () => {
    const history: HistoryTurn[] = Array.from({ length: MAX_HISTORY_TURNS + 10 }, (_, i) => ({
      role: i % 2 === 0 ? "user" : "assistant",
      content: `turn-${i}`,
    }));

    const result = windowHistory(history);

    expect(result).toHaveLength(MAX_HISTORY_TURNS);
    expect(result[0]).toEqual(history[10]);
    expect(result[result.length - 1]).toEqual(history[history.length - 1]);
  });

  it("drops the oldest turns until the transcript fits MAX_HISTORY_CHARS", () => {
    const bigTurn: HistoryTurn = { role: "user", content: "x".repeat(MAX_HISTORY_CHARS) };
    const smallTurn: HistoryTurn = { role: "assistant", content: "y" };

    const result = windowHistory([bigTurn, smallTurn]);

    expect(result).toEqual([smallTurn]);
  });

  it("drops even the newest turn if it alone exceeds MAX_HISTORY_CHARS", () => {
    const overLimitTurn: HistoryTurn = { role: "user", content: "x".repeat(MAX_HISTORY_CHARS + 1) };

    const result = windowHistory([{ role: "assistant", content: "old" }, overLimitTurn]);

    expect(result).toEqual([]);
  });

  it("returns an empty array for empty input", () => {
    expect(windowHistory([])).toEqual([]);
  });
});

describe("validateChatMessageRequest", () => {
  it("accepts a well-formed body and trims the message", () => {
    const result = validateChatMessageRequest({ chatId: "abc123", message: "  hello  " });

    expect(result).toEqual({ ok: true, value: { chatId: "abc123", message: "hello" } });
  });

  it("rejects a non-object body", () => {
    expect(validateChatMessageRequest(null)).toEqual({
      ok: false,
      error: "Request body must be a JSON object.",
    });
    expect(validateChatMessageRequest("hello")).toEqual({
      ok: false,
      error: "Request body must be a JSON object.",
    });
    expect(validateChatMessageRequest([1, 2, 3])).toEqual({
      ok: false,
      error: "Request body must be a JSON object.",
    });
  });

  it("rejects a missing or non-string chatId", () => {
    expect(validateChatMessageRequest({ message: "hi" })).toEqual({
      ok: false,
      error: "`chatId` is required and must be a string.",
    });
    expect(validateChatMessageRequest({ chatId: 42, message: "hi" })).toEqual({
      ok: false,
      error: "`chatId` is required and must be a string.",
    });
  });

  it("rejects a blank chatId", () => {
    expect(validateChatMessageRequest({ chatId: "   ", message: "hi" })).toEqual({
      ok: false,
      error: "`chatId` is required and must be a string.",
    });
  });

  it("rejects a missing or non-string message", () => {
    expect(validateChatMessageRequest({ chatId: "abc" })).toEqual({
      ok: false,
      error: "`message` is required and must be a string.",
    });
    expect(validateChatMessageRequest({ chatId: "abc", message: 5 })).toEqual({
      ok: false,
      error: "`message` is required and must be a string.",
    });
  });

  it("rejects a message that is empty after trimming", () => {
    expect(validateChatMessageRequest({ chatId: "abc", message: "   " })).toEqual({
      ok: false,
      error: "`message` cannot be empty.",
    });
  });

  it("rejects a message longer than MAX_MESSAGE_CHARS", () => {
    const message = "a".repeat(MAX_MESSAGE_CHARS + 1);

    expect(validateChatMessageRequest({ chatId: "abc", message })).toEqual({
      ok: false,
      error: `\`message\` is limited to ${MAX_MESSAGE_CHARS} characters.`,
    });
  });

  it("accepts a message exactly at MAX_MESSAGE_CHARS", () => {
    const message = "a".repeat(MAX_MESSAGE_CHARS);

    const result = validateChatMessageRequest({ chatId: "abc", message });

    expect(result).toEqual({ ok: true, value: { chatId: "abc", message } });
  });
});
