import { Router } from "express";
import { Types } from "mongoose";
import { MAX_CHATS_PER_PROJECT, isProjectFull } from "../lib/limits/limits.js";
import { Chat, isValidObjectId } from "../models/Chat.js";
import { Project } from "../models/Project.js";
import { requireAuth } from "../middleware/requireAuth.js";

const router = Router();

router.use(requireAuth);

const MAX_TITLE_LENGTH = 200;

router.get("/", async (req, res) => {
  // $size counts inside Mongo. Selecting `messages` and reading .length would
  // pull every message body of every chat across the wire to produce a number,
  // so the sidebar's cost would grow with total conversation volume.
  const chats = await Chat.aggregate<{
    _id: unknown;
    title: string;
    projectId: unknown;
    messageCount: number;
    updatedAt: Date;
  }>([
    { $match: { userId: new Types.ObjectId(req.userId) } },
    { $sort: { updatedAt: -1 } },
    {
      $project: {
        title: 1,
        projectId: 1,
        updatedAt: 1,
        messageCount: { $size: { $ifNull: ["$messages", []] } },
      },
    },
  ]);

  res.json(
    chats.map((chat) => ({
      id: String(chat._id),
      title: chat.title,
      projectId: chat.projectId ? String(chat.projectId) : null,
      // The client swaps the composer for a "new chat" button at the cap, and
      // sending the count here saves it fetching every chat to find out.
      messageCount: chat.messageCount,
      updatedAt: chat.updatedAt,
    })),
  );
});

router.post("/", async (req, res) => {
  const titleInput = req.body?.title;
  const title = typeof titleInput === "string" && titleInput.trim() ? titleInput.trim().slice(0, MAX_TITLE_LENGTH) : "New chat";

  const projectIdInput = req.body?.projectId;
  let projectId: string | null = null;

  if (projectIdInput !== undefined && projectIdInput !== null) {
    if (typeof projectIdInput !== "string" || !isValidObjectId(projectIdInput)) {
      res.status(400).json({ message: "Invalid projectId." });
      return;
    }

    const project = await Project.findOne({ _id: projectIdInput, userId: req.userId });
    if (!project) {
      res.status(404).json({ message: "Project not found." });
      return;
    }

    const chatCount = await Chat.countDocuments({ userId: req.userId, projectId: project.id });
    if (isProjectFull(chatCount)) {
      res.status(409).json({
        message: `A project holds at most ${MAX_CHATS_PER_PROJECT} chats.`,
        code: "PROJECT_FULL",
      });
      return;
    }

    projectId = project.id;
  }

  const chat = await Chat.create({ userId: req.userId, title, projectId, messages: [] });
  res.status(201).json({
    id: chat.id,
    title: chat.title,
    projectId,
    messageCount: 0,
    updatedAt: chat.updatedAt,
    messages: [],
  });
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
    projectId: chat.projectId ? String(chat.projectId) : null,
    messageCount: chat.messages.length,
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
