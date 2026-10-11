import { describe, expect, it, vi } from "vitest";
import { CHARS_PER_TOKEN } from "../tokens/tokens.js";
import { CHUNK_TOKENS } from "../chunking/chunking.js";
import { MAX_CHUNKS_PER_UPLOAD } from "../limits/limits.js";
import {
  INGESTION_TIMEOUT_MS,
  ingest,
  staleIngestionCutoff,
  toStatusUpdate,
  type IngestionDeps,
} from "./ingestion.js";

/** Deps that succeed, embedding each text as a one-number vector of its length. */
const deps = (overrides: Partial<IngestionDeps> = {}): IngestionDeps => ({
  extract: async () => "Cats sleep a lot.\n\nDogs love to play fetch.",
  embed: async (texts) => texts.map((text) => [text.length]),
  saveChunks: vi.fn(async () => {}),
  deleteChunks: vi.fn(async () => {}),
  ...overrides,
});

const boom = async (): Promise<never> => {
  throw new Error("boom");
};

describe("ingest", () => {
  it("stores each chunk with its own vector and reports ready", async () => {
    const run = deps();

    expect(await ingest(run)).toEqual({ status: "ready", chunkCount: 1 });
    expect(run.saveChunks).toHaveBeenCalledWith([
      {
        text: "Cats sleep a lot.\n\nDogs love to play fetch.",
        position: 0,
        tokens: 11,
        embedding: [43],
      },
    ]);
  });

  it("fails as unreadable when extraction throws", async () => {
    expect(await ingest(deps({ extract: boom }))).toEqual({ status: "failed", code: "UNREADABLE_FILE" });
  });

  // A scanned PDF has pages but no text layer.
  it("fails as empty when the file holds no text", async () => {
    const run = deps({ extract: async () => "  \n\n  " });

    expect(await ingest(run)).toEqual({ status: "failed", code: "EMPTY_TEXT" });
    expect(run.saveChunks).not.toHaveBeenCalled();
  });

  it("refuses a file over the chunk cap before spending any embedding calls", async () => {
    const embed = vi.fn(async () => []);
    const huge = "x".repeat(CHUNK_TOKENS * CHARS_PER_TOKEN * (MAX_CHUNKS_PER_UPLOAD + 1));

    const result = await ingest(deps({ extract: async () => huge, embed }));

    expect(result).toEqual({ status: "failed", code: "TOO_MANY_CHUNKS" });
    expect(embed).not.toHaveBeenCalled();
  });

  it("fails without storing anything when embedding throws", async () => {
    const run = deps({ embed: boom });

    expect(await ingest(run)).toEqual({ status: "failed", code: "EMBEDDING_FAILED" });
    expect(run.saveChunks).not.toHaveBeenCalled();
  });

  // A partial insert would leave vectors that no ready upload owns.
  it("cleans up partial chunks when storage fails", async () => {
    const run = deps({ saveChunks: boom });

    expect(await ingest(run)).toEqual({ status: "failed", code: "STORAGE_FAILED" });
    expect(run.deleteChunks).toHaveBeenCalled();
  });

  it("still reports the storage failure when cleanup also fails", async () => {
    const result = await ingest(deps({ saveChunks: boom, deleteChunks: boom }));

    expect(result).toEqual({ status: "failed", code: "STORAGE_FAILED" });
  });
});

describe("staleIngestionCutoff", () => {
  it("is one timeout before now", () => {
    const now = new Date("2026-10-10T12:00:00Z");

    expect(now.getTime() - staleIngestionCutoff(now).getTime()).toBe(INGESTION_TIMEOUT_MS);
  });
});

describe("toStatusUpdate", () => {
  it("marks a ready upload with its chunk count and no failure", () => {
    expect(toStatusUpdate({ status: "ready", chunkCount: 7 })).toEqual({
      status: "ready",
      chunkCount: 7,
      failureCode: null,
    });
  });

  it("marks a failed upload with its code and zero chunks", () => {
    expect(toStatusUpdate({ status: "failed", code: "EMPTY_TEXT" })).toEqual({
      status: "failed",
      chunkCount: 0,
      failureCode: "EMPTY_TEXT",
    });
  });
});
