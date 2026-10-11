/** Semantic search over the files a user added. The declaration is what the
 *  model reads; `searchMyFiles` is what runs. */
import { Types } from "mongoose";
import { embedQuery } from "../lib/embeddings/embeddings.js";
import {
  SEARCH_CANDIDATES,
  SEARCH_RESULTS,
  selectContext,
  type ScoredChunk,
} from "../lib/retrieval/retrieval.js";
import { Chunk, chunkVectorIndex } from "../models/Chunk.js";
import { Upload } from "../models/Upload.js";

export type SearchMyFilesArgs = { query: string };

export const searchMyFilesDeclaration = {
  name: "searchMyFiles",
  description:
    "Search the files the user added to this conversation (PDF, text and Markdown) by meaning, not exact words. Use it whenever a question may be answered by those files. Pass a self-contained query naming the topic, such as \"refund policy for annual plans\", never a fragment like \"what about that\". Results are excerpts with the file each came from; name the file in your answer. If nothing relevant comes back, say so rather than guessing.",
  parameters: {
    type: "object",
    properties: {
      query: {
        type: "string",
        description: "What to look for, phrased as a standalone question or topic.",
      },
    },
    required: ["query"],
  },
} as const;

/** Which files a search may read: only those attached in this chat. */
export type FileSearchScope = { userId: string; chatId: string };

export type FileMatch = { file: string; position: number; text: string; score: number };

export type SearchFilesErrorCode = "QUERY_TOO_SHORT" | "SEARCH_FAILED";

/** A failed search is a normal outcome: the model reads the code and explains itself. */
export type SearchMyFilesResult =
  | { ok: true; matches: FileMatch[] }
  | { ok: false; code: SearchFilesErrorCode; message: string };

const MIN_QUERY_CHARS = 2;

/** Mongo's shape stops here; nothing outside this file sees a raw result. */
type StoredMatch = Omit<ScoredChunk, "uploadId"> & { uploadId: Types.ObjectId };

const failure = (code: SearchFilesErrorCode, message: string): SearchMyFilesResult => ({
  ok: false,
  code,
  message,
});

/**
 * userId is in the pre-filter, never checked afterwards, so another user's
 * chunks are never candidates.
 */
export const buildVectorSearch = (queryVector: number[], { userId, chatId }: FileSearchScope) => [
  {
    $vectorSearch: {
      index: chunkVectorIndex.name,
      path: "embedding",
      queryVector,
      numCandidates: SEARCH_CANDIDATES,
      limit: SEARCH_RESULTS,
      filter: {
        userId: new Types.ObjectId(userId),
        chatId: new Types.ObjectId(chatId),
      },
    },
  },
  {
    $project: {
      _id: 0,
      uploadId: 1,
      position: 1,
      text: 1,
      tokens: 1,
      score: { $meta: "vectorSearchScore" },
    },
  },
];

const fileNamesById = async (chunks: ScoredChunk[], userId: string): Promise<Map<string, string>> => {
  const ids = [...new Set(chunks.map((chunk) => chunk.uploadId))];
  if (ids.length === 0) return new Map();

  const uploads = await Upload.find({ _id: { $in: ids }, userId }).select("name").lean();
  return new Map(uploads.map((upload) => [String(upload._id), upload.name]));
};

export const searchMyFiles = async (
  { query }: SearchMyFilesArgs,
  scope: FileSearchScope,
): Promise<SearchMyFilesResult> => {
  const trimmed = query.trim();
  if (trimmed.length < MIN_QUERY_CHARS) {
    return failure("QUERY_TOO_SHORT", `Give at least ${MIN_QUERY_CHARS} characters to search for.`);
  }

  try {
    const queryVector = await embedQuery(trimmed);
    const stored = await Chunk.aggregate<StoredMatch>(buildVectorSearch(queryVector, scope));
    const selected = selectContext(stored.map((match) => ({ ...match, uploadId: String(match.uploadId) })));
    const names = await fileNamesById(selected, scope.userId);

    const matches = selected.map(({ uploadId, position, text, score }) => ({
      file: names.get(uploadId) ?? "Unknown file",
      position,
      text,
      score: Math.round(score * 100) / 100,
    }));
    return { ok: true, matches };
  } catch (error) {
    // Logged, not returned: the model gets a sentence while the cause stays with the operator.
    console.error(`[searchMyFiles] "${trimmed}" failed:`, error);
    return failure("SEARCH_FAILED", "Your files could not be searched right now.");
  }
};

/** The line shown in the chat while this call runs. */
export const describeSearchMyFilesCall = ({ query }: SearchMyFilesArgs): string => {
  const trimmed = query.trim();
  if (!trimmed) return "Searching your files";
  return `Searching your files for "${trimmed}"`;
};
