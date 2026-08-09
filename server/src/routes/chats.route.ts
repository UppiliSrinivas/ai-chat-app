import { Router } from "express";
import { Chat, isValidObjectId } from "../models/Chat.js";
import { requireAuth } from "../middleware/requireAuth.js";

const router = Router();

router.use(requireAuth);

const MAX_TITLE_LENGTH = 200;

router.get("/", async (req, res) => {
  const chats = await Chat.find({ userId: req.userId })
    .select("title createdAt updatedAt")
    .sort({ updatedAt: -1 });

  res.json(chats.map((chat) => ({ id: chat.id, title: chat.title, updatedAt: chat.updatedAt })));
});

router.post("/", async (req, res) => {
  const titleInput = req.body?.title;
  const title = typeof titleInput === "string" && titleInput.trim() ? titleInput.trim().slice(0, MAX_TITLE_LENGTH) : "New chat";

  const chat = await Chat.create({ userId: req.userId, title, messages: [] });
  res.status(201).json({ id: chat.id, title: chat.title, updatedAt: chat.updatedAt, messages: [] });
});

router.get("/:id", async (req, res) => {
  if (!isValidObjectId(req.params.id)) {
    res.status(400).json({ message: "Invalid chat id." });
    return;
  }

  // Scoping the query itself to userId — rather than fetching by id and
  // checking ownership after — means a chat that belongs to someone else
  // is indistinguishable from one that doesn't exist. No user-enumeration
  // signal in the response either way.
  const chat = await Chat.findOne({ _id: req.params.id, userId: req.userId });
  if (!chat) {
    res.status(404).json({ message: "Chat not found." });
    return;
  }

  res.json({
    id: chat.id,
    title: chat.title,
    updatedAt: chat.updatedAt,
    messages: chat.messages.map((message) => ({ role: message.role, content: message.content })),
  });
});

router.patch("/:id", async (req, res) => {
  if (!isValidObjectId(req.params.id)) {
    res.status(400).json({ message: "Invalid chat id." });
    return;
  }

  const titleInput = req.body?.title;
  if (typeof titleInput !== "string" || !titleInput.trim()) {
    res.status(400).json({ message: "`title` is required and must be a non-empty string." });
    return;
  }

  const chat = await Chat.findOneAndUpdate(
    { _id: req.params.id, userId: req.userId },
    { title: titleInput.trim().slice(0, MAX_TITLE_LENGTH) },
    { new: true },
  );

  if (!chat) {
    res.status(404).json({ message: "Chat not found." });
    return;
  }

  res.json({ id: chat.id, title: chat.title, updatedAt: chat.updatedAt });
});

router.delete("/:id", async (req, res) => {
  if (!isValidObjectId(req.params.id)) {
    res.status(400).json({ message: "Invalid chat id." });
    return;
  }

  const chat = await Chat.findOneAndDelete({ _id: req.params.id, userId: req.userId });
  if (!chat) {
    res.status(404).json({ message: "Chat not found." });
    return;
  }

  res.status(204).end();
});

export default router;
