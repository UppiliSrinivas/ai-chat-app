import { Schema, model, type InferSchemaType } from "mongoose";
import { EMBEDDING_DIMENSIONS } from "../lib/embeddings/embeddings.js";

/**
 * One embedded slice of an Upload. userId and chatId are copied from the
 * upload so vector search can filter on them without a join.
 */
const chunkSchema = new Schema(
  {
    userId: { type: Schema.Types.ObjectId, ref: "User", required: true, index: true },
    uploadId: { type: Schema.Types.ObjectId, ref: "Upload", required: true },
    chatId: { type: Schema.Types.ObjectId, ref: "Chat", required: true },
    position: { type: Number, required: true, min: 0 },
    text: { type: String, required: true },
    tokens: { type: Number, default: 0, min: 0 },
    embedding: {
      type: [Number],
      // Without this an omitted vector defaults to [] and slips past `required`.
      default: undefined,
      required: true,
      validate: {
        validator: (vector: number[]) => vector.length === EMBEDDING_DIMENSIONS,
        message: `embedding must have ${EMBEDDING_DIMENSIONS} dimensions`,
      },
    },
  },
  { timestamps: { createdAt: true, updatedAt: false } },
);

// A retried ingestion can't store the same slice twice; also serves delete-by-upload.
chunkSchema.index({ uploadId: 1, position: 1 }, { unique: true });

/** Atlas Vector Search index. dotProduct because embeddings.ts normalizes every vector. */
export const chunkVectorIndex = {
  name: "chunk_embedding",
  type: "vectorSearch",
  definition: {
    fields: [
      { type: "vector", path: "embedding", numDimensions: EMBEDDING_DIMENSIONS, similarity: "dotProduct" },
      { type: "filter", path: "userId" },
      { type: "filter", path: "chatId" },
      { type: "filter", path: "uploadId" },
    ],
  },
};

export type ChunkDoc = InferSchemaType<typeof chunkSchema>;

export const Chunk = model("Chunk", chunkSchema);
