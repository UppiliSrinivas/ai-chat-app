import { Router, type NextFunction, type Request, type Response } from "express";
import multer from "multer";
import type { HydratedDocument } from "mongoose";
import { embedDocuments } from "../lib/embeddings/embeddings.js";
import { ingest, staleIngestionCutoff, toStatusUpdate } from "../lib/ingestion/ingestion.js";
import { toAttachmentNote } from "../lib/history/history.js";
import {
  MAX_CHAT_TOKENS,
  MAX_UPLOAD_BYTES,
  MAX_UPLOADS_PER_CHAT,
  isChatFull,
  isChatUploadsFull,
} from "../lib/limits/limits.js";
import { extractText, resolveMimeType, type ExtractableMimeType } from "../lib/text-extraction/text-extraction.js";
import { estimateTokens } from "../lib/tokens/tokens.js";
import { Chat, isValidObjectId } from "../models/Chat.js";
import { Chunk } from "../models/Chunk.js";
import { Upload, type UploadDoc } from "../models/Upload.js";
import { requireAuth } from "../middleware/requireAuth.js";
import { uploadLimiter } from "../middleware/rateLimit.js";

const router = Router();

// Only POST is rate-limited: the client polls GET while a file ingests.
router.use(requireAuth);

type UploadRecord = HydratedDocument<UploadDoc>;

const MAX_TITLE_LENGTH = 60;

const toUploadView = (upload: UploadRecord) => ({
  id: upload.id,
  name: upload.name,
  mimeType: upload.mimeType,
  sizeBytes: upload.sizeBytes,
  chatId: String(upload.chatId),
  status: upload.status,
  chunkCount: upload.chunkCount,
  failureCode: upload.failureCode ?? null,
  createdAt: upload.createdAt,
});

// Memory storage is fine at this size, and the bytes are dropped once ingested.
const receiveFile = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_UPLOAD_BYTES, files: 1 },
}).single("file");

/** multer's own errors would otherwise reach the error handler as 500s. */
const acceptFile = (req: Request, res: Response, next: NextFunction): void => {
  receiveFile(req, res, (error: unknown) => {
    if (!(error instanceof multer.MulterError)) {
      next(error);
      return;
    }
    if (error.code === "LIMIT_FILE_SIZE") {
      const maxMegabytes = MAX_UPLOAD_BYTES / (1024 * 1024);
      res.status(413).json({ message: `Files can be up to ${maxMegabytes}MB.`, code: "UPLOAD_TOO_LARGE" });
      return;
    }
    res.status(400).json({ message: "Send one file in the `file` field.", code: "INVALID_UPLOAD" });
  });
};

/** A deploy can cut ingestion off mid-file; anything stuck past the timeout reads as failed. */
const failStaleUploads = async (userId: string): Promise<void> => {
  await Upload.updateMany(
    { userId, status: "processing", createdAt: { $lt: staleIngestionCutoff(new Date()) } },
    { status: "failed", failureCode: "INTERRUPTED" },
  );
};

const runIngestion = async (upload: UploadRecord, bytes: Buffer, mimeType: ExtractableMimeType) => {
  const owner = { userId: upload.userId, uploadId: upload._id, chatId: upload.chatId };

  const result = await ingest({
    extract: () => extractText(bytes, mimeType),
    embed: embedDocuments,
    saveChunks: async (chunks) => {
      await Chunk.insertMany(chunks.map((chunk) => ({ ...chunk, ...owner })));
    },
    deleteChunks: async () => {
      await Chunk.deleteMany(owner);
    },
  });

  const { matchedCount } = await Upload.updateOne(
    { _id: upload._id, userId: upload.userId },
    toStatusUpdate(result),
  );
  // Deleted while ingesting: its chunks were saved after DELETE ran, so drop them now.
  if (matchedCount === 0) await Chunk.deleteMany(owner);
};

router.get("/", async (req, res) => {
  const chatId = req.query.chatId;
  if (chatId !== undefined && (typeof chatId !== "string" || !isValidObjectId(chatId))) {
    res.status(400).json({ message: "Invalid chat id." });
    return;
  }

  await failStaleUploads(req.userId!);
  const filter = chatId === undefined ? { userId: req.userId } : { userId: req.userId, chatId };
  const uploads = await Upload.find(filter).sort({ createdAt: -1 });

  res.json(uploads.map(toUploadView));
});

router.get("/:id", async (req, res) => {
  if (!isValidObjectId(req.params.id)) {
    res.status(400).json({ message: "Invalid upload id." });
    return;
  }

  await failStaleUploads(req.userId!);
  const upload = await Upload.findOne({ _id: req.params.id, userId: req.userId });
  if (!upload) {
    res.status(404).json({ message: "Upload not found." });
    return;
  }

  res.json(toUploadView(upload));
});

router.post("/", uploadLimiter, acceptFile, async (req, res) => {
  const file = req.file;
  if (!file) {
    res.status(400).json({ message: "Send one file in the `file` field.", code: "INVALID_UPLOAD" });
    return;
  }

  const mimeType = resolveMimeType(file.originalname, file.mimetype);
  if (!mimeType) {
    res.status(415).json({ message: "Only PDF, .txt and .md files are supported.", code: "UNSUPPORTED_FILE_TYPE" });
    return;
  }

  const chatId: unknown = req.body?.chatId;
  if (typeof chatId !== "string" || !isValidObjectId(chatId)) {
    res.status(400).json({ message: "`chatId` is required.", code: "INVALID_UPLOAD" });
    return;
  }

  // Scoped to userId, so someone else's chat looks the same as a missing one.
  const chat = await Chat.findOne({ _id: chatId, userId: req.userId });
  if (!chat) {
    res.status(404).json({ message: "Chat not found." });
    return;
  }

  if (isChatFull(chat.tokenCount ?? 0)) {
    res.status(409).json({
      message: `This chat has reached its limit of ${MAX_CHAT_TOKENS} tokens. Start a new chat to continue.`,
      code: "CHAT_FULL",
    });
    return;
  }

  const uploadCount = await Upload.countDocuments({ userId: req.userId, chatId });
  if (isChatUploadsFull(uploadCount)) {
    res.status(409).json({
      message: `A chat can hold ${MAX_UPLOADS_PER_CHAT} files. Start a new chat to add more.`,
      code: "UPLOADS_FULL",
    });
    return;
  }

  const upload = await Upload.create({
    userId: req.userId,
    chatId,
    name: file.originalname,
    mimeType,
    sizeBytes: file.size,
  });

  // The file becomes a message in the chat, priced like one. A chat opened with
  // a file is titled after it, the way a first message titles a chat.
  const noteTokens = estimateTokens(toAttachmentNote(upload.name));
  const isUntitled = chat.title === "New chat" && chat.messages.length === 0;
  await Chat.updateOne(
    { _id: chat._id, userId: req.userId },
    {
      $push: { messages: { role: "user", kind: "file", uploadId: upload._id, content: upload.name, tokens: noteTokens } },
      $inc: { tokenCount: noteTokens },
      ...(isUntitled ? { $set: { title: upload.name.slice(0, MAX_TITLE_LENGTH) } } : {}),
    },
  );

  res.status(202).json(toUploadView(upload));

  // After the response, so failures land on the upload's status, never the request.
  runIngestion(upload, file.buffer, mimeType).catch((error) => {
    console.error("[ingestion]", error);
  });
});

router.delete("/:id", async (req, res) => {
  if (!isValidObjectId(req.params.id)) {
    res.status(400).json({ message: "Invalid upload id." });
    return;
  }

  const upload = await Upload.findOne({ _id: req.params.id, userId: req.userId });
  if (!upload) {
    res.status(404).json({ message: "Upload not found." });
    return;
  }

  // Chunks first: dropping the upload first would strand vectors nothing can find again.
  await Chunk.deleteMany({ userId: req.userId, uploadId: upload._id });
  await Upload.deleteOne({ _id: upload._id, userId: req.userId });

  res.status(204).end();
});

export default router;
