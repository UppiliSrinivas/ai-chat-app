import { Router } from "express";
import { Types } from "mongoose";
import { Chat, isValidObjectId } from "../models/Chat.js";
import { Project } from "../models/Project.js";
import { requireAuth } from "../middleware/requireAuth.js";
import { chatLimiter } from "../middleware/rateLimit.js";

const router = Router();

// Creating a project is a free write for any authenticated user, guests
// included. requireAuth runs first so the limiter keys on req.userId, not IP.
router.use(requireAuth, chatLimiter);

const MAX_NAME_LENGTH = 200;

const readName = (value: unknown): string | null =>
  typeof value === "string" && value.trim() ? value.trim().slice(0, MAX_NAME_LENGTH) : null;

router.get("/", async (req, res) => {
  const projects = await Project.find({ userId: req.userId }).sort({ updatedAt: -1 });

  // One grouped count instead of a query per project, so the list stays a
  // fixed two round-trips however many projects a user has.
  const counts = await Chat.aggregate<{ _id: unknown; count: number }>([
    // aggregate() skips Mongoose casting, so the string userId must become an
    // ObjectId by hand — a raw string here matches nothing and every project
    // silently reports zero chats.
    { $match: { userId: new Types.ObjectId(req.userId), projectId: { $ne: null } } },
    { $group: { _id: "$projectId", count: { $sum: 1 } } },
  ]);

  const countByProject = new Map(counts.map((entry) => [String(entry._id), entry.count]));

  res.json(
    projects.map((project) => ({
      id: project.id,
      name: project.name,
      chatCount: countByProject.get(project.id) ?? 0,
      updatedAt: project.updatedAt,
    })),
  );
});

router.post("/", async (req, res) => {
  const name = readName(req.body?.name) ?? "New project";

  const project = await Project.create({ userId: req.userId, name });
  res.status(201).json({ id: project.id, name: project.name, chatCount: 0, updatedAt: project.updatedAt });
});

router.patch("/:id", async (req, res) => {
  if (!isValidObjectId(req.params.id)) {
    res.status(400).json({ message: "Invalid project id." });
    return;
  }

  const name = readName(req.body?.name);
  if (!name) {
    res.status(400).json({ message: "`name` is required and must be a non-empty string." });
    return;
  }

  const project = await Project.findOneAndUpdate(
    { _id: req.params.id, userId: req.userId },
    { name },
    { new: true },
  );

  if (!project) {
    res.status(404).json({ message: "Project not found." });
    return;
  }

  const chatCount = await Chat.countDocuments({ userId: req.userId, projectId: project.id });
  res.json({ id: project.id, name: project.name, chatCount, updatedAt: project.updatedAt });
});

router.delete("/:id", async (req, res) => {
  if (!isValidObjectId(req.params.id)) {
    res.status(400).json({ message: "Invalid project id." });
    return;
  }

  const project = await Project.findOne({ _id: req.params.id, userId: req.userId });
  if (!project) {
    res.status(404).json({ message: "Project not found." });
    return;
  }

  // Chats go first: dropping the project first would leave them pointing at a
  // projectId nothing can resolve, and no retry could find them again.
  // Both filters stay scoped by userId so a later refactor that moves either
  // line can't turn into a cross-tenant delete.
  await Chat.deleteMany({ userId: req.userId, projectId: project.id });
  await Project.deleteOne({ _id: project.id, userId: req.userId });

  res.status(204).end();
});

export default router;
