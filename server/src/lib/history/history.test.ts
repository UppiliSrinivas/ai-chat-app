import { describe, expect, it } from "vitest";
import { toGeminiContents } from "./history.js";
import type { ChatRequest } from "../chat-request/chat-request.js";

describe("toGeminiContents", () => {
  it("appends the current message after the prior history", () => {
    const request: ChatRequest = {
      message: "how are you?",
      history: [
        { role: "user", content: "hi" },
        { role: "assistant", content: "hello!" },
      ],
    };

    const result = toGeminiContents(request);

    expect(result).toEqual([
      { role: "user", parts: [{ text: "hi" }] },
      { role: "model", parts: [{ text: "hello!" }] },
      { role: "user", parts: [{ text: "how are you?" }] },
    ]);
  });

  it("renames assistant turns to Gemini's 'model' role", () => {
    const request: ChatRequest = {
      message: "next",
      history: [{ role: "assistant", content: "prior reply" }],
    };

    const result = toGeminiContents(request);

    expect(result[0]).toEqual({ role: "model", parts: [{ text: "prior reply" }] });
  });

  it("produces a single-turn conversation when history is empty", () => {
    const request: ChatRequest = { message: "hello", history: [] };

    expect(toGeminiContents(request)).toEqual([{ role: "user", parts: [{ text: "hello" }] }]);
  });
});
