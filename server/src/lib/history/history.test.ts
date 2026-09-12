import { describe, expect, it } from "vitest";
import { toFunctionResponseParts, toGeminiContents, toGeminiTools } from "./history.js";
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

describe("toGeminiTools", () => {
  const declarations = [{ name: "getWeather", description: "Look it up.", parameters: { type: "object" } }];

  // Gemini's parametersJsonSchema takes plain JSON Schema, so the neutral
  // declaration is rewrapped rather than translated.
  it("wraps declarations without rewriting their schema", () => {
    expect(toGeminiTools(declarations)).toEqual([
      {
        functionDeclarations: [
          { name: "getWeather", description: "Look it up.", parametersJsonSchema: { type: "object" } },
        ],
      },
    ]);
  });

  it("puts every tool in a single functionDeclarations list", () => {
    const two = [...declarations, { name: "other", description: "d", parameters: {} }];

    expect(toGeminiTools(two)).toHaveLength(1);
    expect(toGeminiTools(two)[0]!.functionDeclarations).toHaveLength(2);
  });
});

describe("toFunctionResponseParts", () => {
  it("echoes the call id back so a response matches the call that asked for it", () => {
    const parts = toFunctionResponseParts([{ id: "call_1", name: "getWeather", output: { ok: true } }]);

    expect(parts).toEqual([
      { functionResponse: { id: "call_1", name: "getWeather", response: { output: { ok: true } } } },
    ]);
  });

  it("keeps one part per outcome so parallel calls stay distinct", () => {
    const parts = toFunctionResponseParts([
      { id: "a", name: "getWeather", output: 1 },
      { id: "b", name: "getWeather", output: 2 },
    ]);

    expect(parts).toHaveLength(2);
  });
});
