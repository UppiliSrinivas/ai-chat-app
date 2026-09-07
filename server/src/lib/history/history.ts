import type { Content } from "@google/genai";
import type { ChatRequest, HistoryTurn } from "../chat-request/chat-request.js";

/**
 * Turns a validated request into Gemini's conversation format.
 *
 * The wire format carries prior turns only, so the current message is appended
 * here rather than in the route, keeping the "is `message` already in
 * `history`?" question answered in exactly one place.
 */

const withCurrentMessage = ({ message, history }: ChatRequest): HistoryTurn[] => [
  ...history,
  { role: "user", content: message },
];

/** Gemini names the model's own turns "model", not "assistant". */
export const toGeminiContents = (request: ChatRequest): Content[] =>
  withCurrentMessage(request).map((turn) => ({
    role: turn.role === "assistant" ? "model" : "user",
    parts: [{ text: turn.content }],
  }));
