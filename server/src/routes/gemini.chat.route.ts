import { Router } from "express";
import { env } from "../config/env.js";
import { gemini, isGeminiConfigured } from "../config/gemini.js";
import { validateChatMessageRequest, windowHistory, type HistoryTurn } from "../lib/chat-request.js";
import { toGeminiContents } from "../lib/history.js";
import { streamSSE } from "../lib/sse.js";
import { requireAuth } from "../middleware/requireAuth.js";
import { Chat, isValidObjectId } from "../models/Chat.js";

const router = Router();

router.use(requireAuth);

const MAX_TITLE_LENGTH = 60;

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

  const priorTurns: HistoryTurn[] = windowHistory(
    chat.messages.map((entry) => ({ role: entry.role, content: entry.content })),
  );

  // Persisted before streaming starts so the user's message survives even
  // if the model call fails outright, rather than living only in a response
  // that never arrives.
  chat.messages.push({ role: "user", content: message });
  if (chat.title === "New chat" && chat.messages.length === 1) {
    chat.title = message.slice(0, MAX_TITLE_LENGTH);
  }
  await chat.save();

  const contents = toGeminiContents({ message, history: priorTurns });

  let fullText = "";

  await streamSSE(res, async function* (abortSignal) {
    const stream = await gemini.models.generateContentStream({
      model: env.geminiModel,
      contents,
      config: { abortSignal },
    });

    for await (const chunk of stream) {
      const text = chunk.text ?? "";
      fullText += text;
      yield text;
    }
  });

  // Only persist an assistant turn if something actually came back — a
  // transient failure with zero chunks shouldn't leave an empty message in
  // the transcript. The user's message above is already saved either way.
  if (fullText) {
    await Chat.updateOne({ _id: chatId }, { $push: { messages: { role: "assistant", content: fullText } } });
  }
});

export default router;
