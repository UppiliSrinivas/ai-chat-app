/**
 * Turns an uploaded file into stored, embedded chunks. Extraction, embedding and
 * storage arrive as deps, so every outcome is testable without Gemini or Mongo.
 */
import { chunkText, type Chunk } from "../chunking/chunking.js";
import { hasTooManyChunks } from "../limits/limits.js";

export const INGESTION_FAILURE_CODES = [
  "UNREADABLE_FILE",
  "EMPTY_TEXT",
  "TOO_MANY_CHUNKS",
  "EMBEDDING_FAILED",
  "STORAGE_FAILED",
  "INTERRUPTED",
] as const;
export type IngestionFailureCode = (typeof INGESTION_FAILURE_CODES)[number];

export type IngestionResult =
  | { status: "ready"; chunkCount: number }
  | { status: "failed"; code: IngestionFailureCode };

export type EmbeddedChunk = Chunk & { embedding: number[] };

export type IngestionDeps = {
  extract: () => Promise<string>;
  embed: (texts: string[]) => Promise<number[][]>;
  saveChunks: (chunks: EmbeddedChunk[]) => Promise<void>;
  deleteChunks: () => Promise<void>;
};

/** Background work outlives a deploy; anything still processing past this was cut off. */
export const INGESTION_TIMEOUT_MS = 10 * 60 * 1000;

export const staleIngestionCutoff = (now: Date): Date =>
  new Date(now.getTime() - INGESTION_TIMEOUT_MS);

const failed = (code: IngestionFailureCode): IngestionResult => ({ status: "failed", code });

/** Never throws: every failure becomes a code the client can show. */
export const ingest = async (deps: IngestionDeps): Promise<IngestionResult> => {
  let text: string;
  try {
    text = await deps.extract();
  } catch {
    return failed("UNREADABLE_FILE");
  }

  // A scanned PDF has pages but no text layer, so it lands here.
  const chunks = chunkText(text);
  if (chunks.length === 0) return failed("EMPTY_TEXT");
  if (hasTooManyChunks(chunks.length)) return failed("TOO_MANY_CHUNKS");

  let vectors: number[][];
  try {
    vectors = await deps.embed(chunks.map((chunk) => chunk.text));
  } catch {
    return failed("EMBEDDING_FAILED");
  }

  try {
    await deps.saveChunks(chunks.map((chunk, index) => ({ ...chunk, embedding: vectors[index] })));
  } catch {
    // A partial insert would leave vectors no ready upload owns.
    await deps.deleteChunks().catch(() => {});
    return failed("STORAGE_FAILED");
  }

  return { status: "ready", chunkCount: chunks.length };
};

export type UploadStatusUpdate =
  | { status: "ready"; chunkCount: number; failureCode: null }
  | { status: "failed"; chunkCount: 0; failureCode: IngestionFailureCode };

/** What to write back to the Upload once ingestion settles. */
export const toStatusUpdate = (result: IngestionResult): UploadStatusUpdate => {
  if (result.status === "ready") {
    return { status: "ready", chunkCount: result.chunkCount, failureCode: null };
  }
  return { status: "failed", chunkCount: 0, failureCode: result.code };
};
