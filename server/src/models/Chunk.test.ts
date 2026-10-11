import { Types } from "mongoose";
import { describe, expect, it } from "vitest";
import { EMBEDDING_DIMENSIONS } from "../lib/embeddings/embeddings.js";
import { Chunk, chunkVectorIndex } from "./Chunk.js";

const valid = {
  userId: new Types.ObjectId(),
  uploadId: new Types.ObjectId(),
  chatId: new Types.ObjectId(),
  position: 0,
  text: "Cats sleep a lot.",
  embedding: Array.from({ length: EMBEDDING_DIMENSIONS }, () => 0.1),
};

describe("Chunk schema", () => {
  it("accepts a complete chunk", () => {
    expect(new Chunk(valid).validateSync()).toBeUndefined();
  });

  it.each(["userId", "uploadId", "chatId", "text", "position"] as const)("requires %s", (field) => {
    const { [field]: _omitted, ...rest } = valid;

    expect(new Chunk(rest).validateSync()?.errors[field]).toBeDefined();
  });

  // An empty array would otherwise pass `required` and be unsearchable.
  it("refuses a chunk with no embedding", () => {
    const { embedding: _omitted, ...rest } = valid;

    expect(new Chunk(rest).validateSync()?.errors.embedding).toBeDefined();
  });

  // A vector of the wrong size can't be compared with the rest of the index.
  it("refuses an embedding of the wrong size", () => {
    const error = new Chunk({ ...valid, embedding: [0.1, 0.2] }).validateSync();

    expect(error?.errors.embedding?.message).toContain(String(EMBEDDING_DIMENSIONS));
  });

  it("refuses a negative position", () => {
    expect(new Chunk({ ...valid, position: -1 }).validateSync()?.errors.position).toBeDefined();
  });

  it("keeps one chunk per position within an upload", () => {
    expect(Chunk.schema.indexes()).toContainEqual([
      { uploadId: 1, position: 1 },
      expect.objectContaining({ unique: true }),
    ]);
  });
});

describe("chunkVectorIndex", () => {
  it("matches the embedding size and uses dotProduct for normalized vectors", () => {
    const [vector] = chunkVectorIndex.definition.fields;

    expect(vector).toEqual({
      type: "vector",
      path: "embedding",
      numDimensions: EMBEDDING_DIMENSIONS,
      similarity: "dotProduct",
    });
  });

  // Without a filter field, search can't be scoped to the owner.
  it("can filter by owner, chat and upload", () => {
    const filters = chunkVectorIndex.definition.fields
      .filter((field) => field.type === "filter")
      .map((field) => field.path);

    expect(filters).toEqual(["userId", "chatId", "uploadId"]);
  });
});
