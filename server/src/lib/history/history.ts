import type { Content, Part, Tool } from "@google/genai";
import type { ChatRequest, HistoryTurn } from "../chat-request/chat-request.js";
import type { ToolDeclaration } from "../../tools/registry.js";

export type ToolOutcome = { id?: string; name?: string; output: unknown };

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

/** How a file message reads to the model: it has no text, only a name to search for. */
export const toAttachmentNote = (fileName: string): string => `[Attached file: ${fileName}]`;

/** A file message followed by a question makes two user turns in a row; one turn with both parts is safer. */
const mergeSameRole = (contents: Content[]): Content[] => {
  const merged: Content[] = [];
  for (const content of contents) {
    const previous = merged.at(-1);
    if (previous && previous.role === content.role) {
      previous.parts = [...(previous.parts ?? []), ...(content.parts ?? [])];
    } else {
      merged.push({ ...content, parts: [...(content.parts ?? [])] });
    }
  }
  return merged;
};

/** Gemini names the model's own turns "model", not "assistant". */
export const toGeminiContents = (request: ChatRequest): Content[] =>
  mergeSameRole(
    withCurrentMessage(request).map((turn) => ({
      role: turn.role === "assistant" ? "model" : "user",
      parts: [{ text: turn.content }],
    })),
  );

/** Gemini takes plain JSON Schema in `parametersJsonSchema`, so the neutral
 *  declarations need rewrapping rather than translating. */
export const toGeminiTools = (declarations: readonly ToolDeclaration[]): Tool[] => [
  {
    functionDeclarations: declarations.map(({ name, description, parameters }) => ({
      name,
      description,
      parametersJsonSchema: parameters,
    })),
  },
];

/** One part per call, echoing the id back so Gemini can match a response to the
 *  call that asked for it. */
export const toFunctionResponseParts = (outcomes: readonly ToolOutcome[]): Part[] =>
  outcomes.map(({ id, name, output }) => ({
    functionResponse: { id, name, response: { output } },
  }));
