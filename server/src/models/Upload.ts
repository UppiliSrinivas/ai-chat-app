import { Schema, model, type InferSchemaType } from "mongoose";
import { INGESTION_FAILURE_CODES } from "../lib/ingestion/ingestion.js";
import { EXTRACTABLE_MIME_TYPES } from "../lib/text-extraction/text-extraction.js";

export const UPLOAD_STATUSES = ["processing", "ready", "failed"] as const;

/**
 * A file the user added for retrieval. Its text and vectors live in Chunk, so
 * listing uploads never drags thousands of embeddings along.
 */
const uploadSchema = new Schema(
  {
    userId: { type: Schema.Types.ObjectId, ref: "User", required: true, index: true },
    // The chat the file was attached in; only that chat can search it.
    chatId: { type: Schema.Types.ObjectId, ref: "Chat", required: true, index: true },
    name: { type: String, required: true, trim: true },
    mimeType: { type: String, enum: EXTRACTABLE_MIME_TYPES, required: true },
    sizeBytes: { type: Number, required: true, min: 0 },
    // Ingestion finishes after the 202 response, so the client polls this.
    status: { type: String, enum: UPLOAD_STATUSES, default: "processing" },
    chunkCount: { type: Number, default: 0, min: 0 },
    // Set only when status is "failed", so the client can say why.
    failureCode: { type: String, enum: [...INGESTION_FAILURE_CODES, null], default: null },
  },
  { timestamps: true },
);

export type UploadDoc = InferSchemaType<typeof uploadSchema>;

export const Upload = model("Upload", uploadSchema);
