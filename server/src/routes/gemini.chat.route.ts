import { Router } from "express";
import { env } from "../config/env.js";
import { gemini, isGeminiConfigured } from "../config/gemini.js";
import { validateChatMessageRequest, windowHistory, type HistoryTurn } from "../lib/chat-request/chat-request.js";
import { toGeminiContents } from "../lib/history/history.js";
import { MAX_CHAT_TOKENS, isChatFull } from "../lib/limits/limits.js";
import { streamSSE } from "../lib/sse/sse.js";
import { estimateTokens } from "../lib/tokens/tokens.js";
import {
  messagesAfterSummary,
  runSummary,
  toSystemInstruction,
  type StoredSummary,
  type SummaryDeps,
  type SummaryMessage,
} from "../lib/summary/summary.js";
import { requireAuth } from "../middleware/requireAuth.js";
import { chatLimiter } from "../middleware/rateLimit.js";
import { Chat, isValidObjectId } from "../models/Chat.js";

const router = Router();

// requireAuth first so the limiter can key on req.userId rather than the IP.
router.use(requireAuth, chatLimiter);

const MAX_TITLE_LENGTH = 60;

/**
 * Plumbing for lib/summary: every rule about what to fold and when lives there,
 * so this only supplies the model call and the two writes.
 */
const summaryDeps = (chatId: string, userId: string | undefined): SummaryDeps => ({
  generate: async ({ system, user }) => {
    const response = await gemini.models.generateContent({
      model: env.geminiModel,
      contents: [{ role: "user", parts: [{ text: user }] }],
      config: { systemInstruction: system },
    });
    return response.text ?? "";
  },

  // Compare-and-set on the reach: an in-request summarize and the next
  // request's fallback can overlap, and the late writer must lose rather than
  // replace a newer summary with an older one.
  store: async ({ text, through, expected }) => {
    await Chat.updateOne(
      {
        _id: chatId,
        userId,
        $or: [{ "summary.throughMessageCount": expected }, { summary: { $exists: false } }],
      },
      { $set: { summary: { text, throughMessageCount: through, failedAttempts: 0 } } },
    );
  },

  // $inc creates the field on a chat that has never been summarized. Every
  // read defaults a missing summary to zero, so a partial subdocument is safe.
  recordFailure: async () => {
    await Chat.updateOne({ _id: chatId, userId }, { $inc: { "summary.failedAttempts": 1 } });
  },
});

router.post("/", async (req, res) => {
  if (!isGeminiConfigured) {
    res.status(503).json({ message: "GEMINI_API_KEY is not configured on the server." });
    return;
  }

  const parsed = validateChatMessageRequest(req.body);
  if (!parsed.ok) {
    res.status(400).json({ message: parsed.error });
    return;
  }

  const { chatId, message } = parsed.value;

  if (!isValidObjectId(chatId)) {
    res.status(400).json({ message: "Invalid chatId." });
    return;
  }

  // Scoped to userId, same reasoning as chats.route.ts: someone else's chat
  // looks identical to a nonexistent one.
  const chat = await Chat.findOne({ _id: chatId, userId: req.userId });
  if (!chat) {
    res.status(404).json({ message: "Chat not found." });
    return;
  }

  // Checked before flushHeaders — once the SSE stream opens, a real HTTP
  // status can no longer be returned.
  if (isChatFull(chat.tokenCount ?? 0)) {
    res.status(409).json({
      message: `This chat has reached its limit of ${MAX_CHAT_TOKENS} tokens. Start a new chat to continue.`,
      code: "CHAT_FULL",
    });
    return;
  }

  const storedMessages: SummaryMessage[] = chat.messages.map((entry) => ({
    role: entry.role,
    content: entry.content,
    tokens: entry.tokens ?? undefined,
  }));

  const storedSummary: StoredSummary | undefined = chat.summary
    ? {
        text: chat.summary.text ?? "",
        throughMessageCount: chat.summary.throughMessageCount ?? 0,
        failedAttempts: chat.summary.failedAttempts ?? 0,
      }
    : undefined;

  // Catch-up: the previous turn's summarize may never have run or finished — a
  // deploy, a restart, a failed call. This fallback, not that attempt, is what
  // makes the summary eventually correct.
  const caughtUp = await runSummary(storedMessages, storedSummary, summaryDeps(chatId, req.userId));

  const summary: StoredSummary | undefined = caughtUp
    ? { text: caughtUp.text, throughMessageCount: caughtUp.through, failedAttempts: 0 }
    : storedSummary;

  const priorTurns: HistoryTurn[] = windowHistory(messagesAfterSummary(storedMessages, summary));

  // Persisted before streaming starts so the user's message survives even
  // if the model call fails outright, rather than living only in a response
  // that never arrives.
  const userTokens = estimateTokens(message);
  chat.messages.push({ role: "user", content: message, tokens: userTokens });
  chat.tokenCount = (chat.tokenCount ?? 0) + userTokens;
  if (chat.title === "New chat" && chat.messages.length === 1) {
    chat.title = message.slice(0, MAX_TITLE_LENGTH);
  }
  await chat.save();

  const contents = toGeminiContents({ message, history: priorTurns });
  const summaryText = summary?.text ?? "";

  let fullText = "";
  let promptTokens: number | undefined;
  let replyTokens: number | undefined;

  await streamSSE(res, async function* (abortSignal) {
    const stream = await gemini.models.generateContentStream({
      model: env.geminiModel,
      contents,
      config: {
        abortSignal,
        // The summary is context, not a turn anyone took, and the guard text
        // marks it as a record rather than something to act on.
        ...(summaryText ? { systemInstruction: toSystemInstruction(summaryText) } : {}),
      },
    });

    for await (const chunk of stream) {
      // Totals ride on the chunks; the last one carries the complete figure,
      // and an aborted stream may never deliver it.
      promptTokens = chunk.usageMetadata?.promptTokenCount ?? promptTokens;
      replyTokens = chunk.usageMetadata?.candidatesTokenCount ?? replyTokens;
      const text = chunk.text ?? "";
      fullText += text;
      yield text;
    }
  });

  // Only persist an assistant turn if something actually came back — a
  // transient failure with zero chunks shouldn't leave an empty message in
  // the transcript. The user's message above is already saved either way.
  if (!fullText) return;

  const assistantTokens = replyTokens ?? estimateTokens(fullText);

  await Chat.updateOne(
    { _id: chatId, userId: req.userId },
    {
      $push: { messages: { role: "assistant", content: fullText, tokens: assistantTokens } },
      $inc: { tokenCount: assistantTokens },
    },
  );

  // The loaded document is one behind, since the turn above was appended with
  // updateOne, so the transcript is rebuilt from what was written rather than
  // re-read. Reading chat.messages here would be short by one at exactly the
  // boundary that decides whether a block is due.
  const transcript: SummaryMessage[] = [
    ...storedMessages,
    { role: "user", content: message, tokens: userTokens },
    { role: "assistant", content: fullText, tokens: assistantTokens },
  ];

  console.log(
    `chat ${chatId}: sent ${promptTokens ?? "?"} prompt tokens, stored ${chat.tokenCount + assistantTokens}, ` +
      `${summary?.throughMessageCount ?? 0}/${transcript.length} messages summarized`,
  );

  await runSummary(transcript, summary, summaryDeps(chatId, req.userId));
});

export default router;
