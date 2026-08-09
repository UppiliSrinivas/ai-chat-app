/**
 * Validation and normalisation for the chat request body.
 *
 * Kept pure and provider-agnostic so it can be unit tested without a server,
 * and so both routes enforce exactly the same rules. Everything here runs
 * BEFORE `res.flushHeaders()`, which is the only window in which a real HTTP
 * status code can still be returned — once headers are flushed the status is
 * committed to 200 and failures have to travel in-band as SSE error events.
 *
 * History now lives in MongoDB rather than on the wire: the client sends a
 * `chatId` and the new `message` only, the route loads that chat's prior
 * turns from the database, and `windowHistory` below trims them the same way
 * the old client-supplied history used to be trimmed. `ChatRequest` /
 * `HistoryTurn` stay as the shape history.ts consumes either way.
 */

export const MAX_MESSAGE_CHARS = 32_000;
export const MAX_HISTORY_TURNS = 80;
export const MAX_HISTORY_CHARS = 120_000;

export type ChatRole = "user" | "assistant";

export interface HistoryTurn {
  role: ChatRole;
  content: string;
}

export interface ChatRequest {
  message: string;
  /** Prior turns only — never includes the current message. */
  history: HistoryTurn[];
}

/** The wire format for POST /gemini/chat: which chat this message belongs
 *  to, plus the new message itself. */
export interface ChatMessageRequest {
  chatId: string;
  message: string;
}

export type ValidationResult =
  | { ok: true; value: ChatMessageRequest }
  | { ok: false; error: string };

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

/**
 * Drops the oldest turns until the transcript fits inside both budgets.
 *
 * Trimming rather than rejecting is deliberate: a conversation that outgrows
 * the window should keep working with less context, not start failing.
 */
export const windowHistory = (history: HistoryTurn[]): HistoryTurn[] => {
  const recent = history.slice(-MAX_HISTORY_TURNS);

  let total = recent.reduce((sum, turn) => sum + turn.content.length, 0);
  let start = 0;

  while (start < recent.length && total > MAX_HISTORY_CHARS) {
    total -= recent[start]!.content.length;
    start += 1;
  }

  return recent.slice(start);
};

export const validateChatMessageRequest = (body: unknown): ValidationResult => {
  if (!isRecord(body)) {
    return { ok: false, error: "Request body must be a JSON object." };
  }

  const { chatId, message } = body;

  if (typeof chatId !== "string" || !chatId.trim()) {
    return { ok: false, error: "`chatId` is required and must be a string." };
  }

  if (typeof message !== "string") {
    return { ok: false, error: "`message` is required and must be a string." };
  }

  const trimmed = message.trim();

  if (!trimmed) {
    return { ok: false, error: "`message` cannot be empty." };
  }

  if (trimmed.length > MAX_MESSAGE_CHARS) {
    return {
      ok: false,
      error: `\`message\` is limited to ${MAX_MESSAGE_CHARS} characters.`,
    };
  }

  return { ok: true, value: { chatId, message: trimmed } };
};
