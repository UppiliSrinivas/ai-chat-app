import { Router } from "express";
import type { Content, FunctionCall, Part } from "@google/genai";
import { env } from "../config/env.js";
import { gemini, isGeminiConfigured } from "../config/gemini.js";
import { validateChatMessageRequest, windowHistory, type HistoryTurn } from "../lib/chat-request/chat-request.js";
import {
  toFunctionResponseParts,
  toGeminiContents,
  toGeminiTools,
  type ToolOutcome,
} from "../lib/history/history.js";
import { MAX_CHAT_TOKENS, MAX_TOOL_STEPS, isChatFull } from "../lib/limits/limits.js";
import { streamSSE, type StreamEvent, type ToolStatus } from "../lib/sse/sse.js";
import { findTool, toolDeclarations, type ToolContext } from "../tools/registry.js";
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

type PlannedCall = {
  id: string;
  name: string;
  label: string;
  call: FunctionCall;
};

type CallRun = { planned: PlannedCall; ok: boolean; outcome: ToolOutcome };

/** Labelled before it runs, because the "running" line has to name the work
 *  while it is still happening. */
const planCall = (call: FunctionCall, index: number): PlannedCall => {
  const name = call.name ?? "unknown";
  const tool = findTool(call.name);
  return {
    id: call.id ?? `${name}-${index}`,
    name,
    label: tool ? tool.describe(call.args ?? {}) : `Running ${name}`,
    call,
  };
};

const runCall = async (planned: PlannedCall, context: ToolContext): Promise<CallRun> => {
  const { call, name } = planned;
  const tool = findTool(call.name);
  const failed = (error: string): CallRun => ({
    planned,
    ok: false,
    outcome: { id: call.id, name: call.name, output: { error } },
  });

  if (!tool) return failed(`No tool named "${name}" exists.`);

  try {
    const output = await tool.run(call.args ?? {}, context);
    return { planned, ok: true, outcome: { id: call.id, name: call.name, output } };
  } catch (error) {
    // The chat stream is already gone, so there is nobody to report to.
    if (context.signal.aborted) throw error;
    return failed(error instanceof Error ? error.message : "The tool failed.");
  }
};

/** Announces every call, runs them together, then announces each outcome.
 *  Parallel because one round can ask for several at once. */
async function* runToolCalls(
  calls: FunctionCall[],
  context: ToolContext,
): AsyncGenerator<StreamEvent, ToolOutcome[]> {
  const planned = calls.map(planCall);

  for (const { id, name, label } of planned) {
    yield { kind: "tool", activity: { id, name, label, status: "running" } };
  }

  const runs = await Promise.all(planned.map((call) => runCall(call, context)));

  for (const run of runs) {
    const { id, name, label } = run.planned;
    const status: ToolStatus = run.ok ? "done" : "failed";
    yield { kind: "tool", activity: { id, name, label, status } };
  }

  return runs.map((run) => run.outcome);
}

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

  // Read off the chat rather than req.userId: the field is required, and the
  // chat was already fetched scoped to that same user.
  const ownerId = chat.userId.toString();
  const contents = toGeminiContents({ message, history: priorTurns });
  const summaryText = summary?.text ?? "";

  let fullText = "";
  let promptTokens: number | undefined;
  let replyTokens: number | undefined;

  await streamSSE(res, async function* (abortSignal) {
    const conversation: Content[] = [...contents];
    const tools = toGeminiTools(toolDeclarations);

    for (let step = 0; step < MAX_TOOL_STEPS; step += 1) {
      const stream = await gemini.models.generateContentStream({
        model: env.geminiModel,
        contents: conversation,
        config: {
          abortSignal,
          tools,
          // The summary is context, not a turn anyone took, and the guard text
          // marks it as a record rather than something to act on.
          ...(summaryText ? { systemInstruction: toSystemInstruction(summaryText) } : {}),
        },
      });

      const calls: FunctionCall[] = [];
      const modelParts: Part[] = [];
      let roundReplyTokens: number | undefined;

      for await (const chunk of stream) {
        // Totals ride on the chunks; the last one carries the complete figure,
        // and an aborted stream may never deliver it.
        promptTokens = chunk.usageMetadata?.promptTokenCount ?? promptTokens;
        roundReplyTokens = chunk.usageMetadata?.candidatesTokenCount ?? roundReplyTokens;

        // Read from the parts rather than chunk.text/chunk.functionCalls: those
        // getters log a warning whenever a response mixes text and calls.
        for (const part of chunk.candidates?.[0]?.content?.parts ?? []) {
          modelParts.push(part);
          if (part.functionCall) calls.push(part.functionCall);
          if (part.thought || !part.text) continue;

          fullText += part.text;
          yield { kind: "delta", text: part.text };
        }
      }

      // Each round is priced separately, so the figures add rather than replace.
      if (roundReplyTokens !== undefined) replyTokens = (replyTokens ?? 0) + roundReplyTokens;

      if (calls.length === 0) return;

      // Echoed back verbatim: Gemini 3 rejects a rebuilt turn whose functionCall
      // parts have lost their thought signature.
      conversation.push({ role: "model", parts: modelParts });

      const outcomes = yield* runToolCalls(calls, { userId: ownerId, signal: abortSignal });
      conversation.push({ role: "user", parts: toFunctionResponseParts(outcomes) });
    }

    // Out of steps rather than out of things to say — better than silence.
    const notice = "I could not finish that — it needed more tool steps than I am allowed.";
    fullText += notice;
    yield { kind: "delta", text: notice };
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
