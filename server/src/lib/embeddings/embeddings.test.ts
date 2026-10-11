import { beforeEach, describe, expect, it, vi } from "vitest";

const embedContent = vi.hoisted(() => vi.fn());
vi.mock("../../config/gemini.js", () => ({ gemini: { models: { embedContent } } }));

import {
  EMBEDDING_DIMENSIONS,
  EMBEDDING_MODEL,
  MAX_EMBED_BATCH,
  embedDocuments,
  embedQuery,
  normalize,
} from "./embeddings.js";

/** Answers each call with one [3, 4] vector per input, as the API would. */
const respondPerInput = () =>
  embedContent.mockImplementation(async ({ contents }: { contents: string[] }) => ({
    embeddings: contents.map(() => ({ values: [3, 4] })),
  }));

beforeEach(() => {
  embedContent.mockReset();
});

describe("normalize", () => {
  it("scales a vector to unit length", () => {
    expect(normalize([3, 4])).toEqual([0.6, 0.8]);
  });

  it("leaves a zero vector alone instead of dividing by zero", () => {
    expect(normalize([0, 0])).toEqual([0, 0]);
  });
});

describe("embedDocuments", () => {
  it("embeds as documents at the configured size and normalizes", async () => {
    respondPerInput();

    const vectors = await embedDocuments(["a", "b"]);

    expect(vectors).toEqual([
      [0.6, 0.8],
      [0.6, 0.8],
    ]);
    expect(embedContent).toHaveBeenCalledWith({
      model: EMBEDDING_MODEL,
      contents: ["a", "b"],
      config: { taskType: "RETRIEVAL_DOCUMENT", outputDimensionality: EMBEDDING_DIMENSIONS },
    });
  });

  it("splits large inputs into API-sized batches, keeping order", async () => {
    respondPerInput();
    const texts = Array.from({ length: MAX_EMBED_BATCH * 2 + 1 }, (_, i) => `chunk ${i}`);

    const vectors = await embedDocuments(texts);

    expect(vectors).toHaveLength(texts.length);
    const batchSizes = embedContent.mock.calls.map(([req]) => req.contents.length);
    expect(batchSizes).toEqual([MAX_EMBED_BATCH, MAX_EMBED_BATCH, 1]);
    expect(embedContent.mock.calls[2][0].contents).toEqual([`chunk ${MAX_EMBED_BATCH * 2}`]);
  });

  it("makes no call for an empty input", async () => {
    expect(await embedDocuments([])).toEqual([]);
    expect(embedContent).not.toHaveBeenCalled();
  });

  // A short response would silently pair chunks with the wrong vectors.
  it("throws when the API returns fewer embeddings than inputs", async () => {
    embedContent.mockResolvedValue({ embeddings: [{ values: [1, 0] }] });

    await expect(embedDocuments(["a", "b"])).rejects.toThrow("Expected 2 embeddings, got 1");
  });

  it("throws when an embedding has no values", async () => {
    embedContent.mockResolvedValue({ embeddings: [{}] });

    await expect(embedDocuments(["a"])).rejects.toThrow();
  });

  it("throws when the response has no embeddings at all", async () => {
    embedContent.mockResolvedValue({});

    await expect(embedDocuments(["a"])).rejects.toThrow("got 0");
  });
});

describe("embedQuery", () => {
  it("embeds as a query and returns a single vector", async () => {
    respondPerInput();

    expect(await embedQuery("what is RAG?")).toEqual([0.6, 0.8]);
    expect(embedContent.mock.calls[0][0].config.taskType).toBe("RETRIEVAL_QUERY");
  });
});
