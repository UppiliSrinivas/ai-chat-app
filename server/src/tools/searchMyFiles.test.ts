import { Types } from "mongoose";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { MIN_RELEVANCE, SEARCH_RESULTS } from "../lib/retrieval/retrieval.js";

/** Mocked rather than connected: what matters is the search the tool builds. */
const { aggregateMock, embedQueryMock, findUploadsMock } = vi.hoisted(() => ({
  aggregateMock: vi.fn(),
  embedQueryMock: vi.fn(),
  findUploadsMock: vi.fn(),
}));
vi.mock("../lib/embeddings/embeddings.js", () => ({ embedQuery: embedQueryMock, EMBEDDING_DIMENSIONS: 768 }));
vi.mock("../models/Chunk.js", () => ({
  Chunk: { aggregate: aggregateMock },
  chunkVectorIndex: { name: "chunk_embedding" },
}));
vi.mock("../models/Upload.js", () => ({ Upload: { find: findUploadsMock } }));

import { buildVectorSearch, describeSearchMyFilesCall, searchMyFiles } from "./searchMyFiles.js";

const userId = new Types.ObjectId().toString();
const chatId = new Types.ObjectId().toString();
const uploadId = new Types.ObjectId();

const stubUploads = (uploads: { _id: Types.ObjectId; name: string }[]) => {
  const lean = vi.fn(async () => uploads);
  findUploadsMock.mockReturnValue({ select: () => ({ lean }) });
};

const match = (score: number, position = 0) => ({ uploadId, position, text: `excerpt ${position}`, tokens: 10, score });

beforeEach(() => {
  embedQueryMock.mockResolvedValue([0.1, 0.2]);
  aggregateMock.mockResolvedValue([]);
  stubUploads([]);
});

afterEach(() => {
  vi.resetAllMocks();
});

describe("buildVectorSearch", () => {
  const filterOf = (pipeline: ReturnType<typeof buildVectorSearch>) => pipeline[0].$vectorSearch!.filter;

  // Another user's chunks must never even be candidates.
  it("pre-filters every search to the caller", () => {
    const filter = filterOf(buildVectorSearch([0.1], { userId, chatId }));

    expect(filter.userId).toEqual(new Types.ObjectId(userId));
  });

  // A file attached in one chat is invisible to every other chat.
  it("searches only the files attached in this chat", () => {
    const filter = filterOf(buildVectorSearch([0.1], { userId, chatId }));

    expect(filter.chatId).toEqual(new Types.ObjectId(chatId));
  });

  it("asks for the configured number of results with the score attached", () => {
    const [search, project] = buildVectorSearch([0.1, 0.2], { userId, chatId });

    expect(search.$vectorSearch).toMatchObject({
      index: "chunk_embedding",
      path: "embedding",
      queryVector: [0.1, 0.2],
      limit: SEARCH_RESULTS,
    });
    expect(project.$project).toMatchObject({ score: { $meta: "vectorSearchScore" } });
  });
});

describe("searchMyFiles", () => {
  it("refuses a query too short to mean anything, without embedding it", async () => {
    const result = await searchMyFiles({ query: " a " }, { userId, chatId });

    expect(result).toMatchObject({ ok: false, code: "QUERY_TOO_SHORT" });
    expect(embedQueryMock).not.toHaveBeenCalled();
  });

  it("embeds the trimmed query", async () => {
    await searchMyFiles({ query: "  refund policy  " }, { userId, chatId });

    expect(embedQueryMock).toHaveBeenCalledWith("refund policy");
  });

  it("returns relevant excerpts named by their file, best first", async () => {
    aggregateMock.mockResolvedValue([match(0.8, 1), match(0.95, 0)]);
    stubUploads([{ _id: uploadId, name: "policy.pdf" }]);

    const result = await searchMyFiles({ query: "refunds" }, { userId, chatId });

    expect(result).toEqual({
      ok: true,
      matches: [
        { file: "policy.pdf", position: 0, text: "excerpt 0", score: 0.95 },
        { file: "policy.pdf", position: 1, text: "excerpt 1", score: 0.8 },
      ],
    });
  });

  it("drops weak matches before looking up any file names", async () => {
    aggregateMock.mockResolvedValue([match(MIN_RELEVANCE - 0.1)]);

    const result = await searchMyFiles({ query: "refunds" }, { userId, chatId });

    expect(result).toEqual({ ok: true, matches: [] });
    expect(findUploadsMock).not.toHaveBeenCalled();
  });

  it("looks file names up scoped to the caller", async () => {
    aggregateMock.mockResolvedValue([match(0.9)]);

    await searchMyFiles({ query: "refunds" }, { userId, chatId });

    expect(findUploadsMock).toHaveBeenCalledWith({ _id: { $in: [String(uploadId)] }, userId });
  });

  // The upload can be deleted between the search and the name lookup.
  it("still returns an excerpt whose file has gone", async () => {
    aggregateMock.mockResolvedValue([match(0.9)]);

    const result = await searchMyFiles({ query: "refunds" }, { userId, chatId });

    expect(result).toMatchObject({ ok: true, matches: [{ file: "Unknown file" }] });
  });

  it("turns a failed embedding or search into a code, not a crash", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    embedQueryMock.mockRejectedValue(new Error("quota"));

    const result = await searchMyFiles({ query: "refunds" }, { userId, chatId });

    expect(result).toMatchObject({ ok: false, code: "SEARCH_FAILED" });
  });
});

describe("describeSearchMyFilesCall", () => {
  it("names the query", () => {
    expect(describeSearchMyFilesCall({ query: " refunds " })).toBe('Searching your files for "refunds"');
  });

  it("falls back when the query is blank", () => {
    expect(describeSearchMyFilesCall({ query: "" })).toBe("Searching your files");
  });
});
