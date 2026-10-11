import { gemini } from "../../config/gemini.js";

export const EMBEDDING_MODEL =
  process.env.TEXT_EMBEDDING_MODEL ?? "gemini-embedding-001";
export const EMBEDDING_DIMENSIONS = 768;
/** The API rejects more inputs than this in a single call. */
export const MAX_EMBED_BATCH = 100;

type TaskType = "RETRIEVAL_DOCUMENT" | "RETRIEVAL_QUERY";

/** Gemini only normalizes the full 3072-dim output; truncated vectors need it done here. */
export const normalize = (vector: number[]): number[] => {
  const length = Math.hypot(...vector);
  if (length === 0) return vector;
  return vector.map((value) => value / length);
};

const embedBatch = async (
  texts: string[],
  taskType: TaskType,
): Promise<number[][]> => {
  const res = await gemini.models.embedContent({
    model: EMBEDDING_MODEL,
    contents: texts,
    config: { taskType, outputDimensionality: EMBEDDING_DIMENSIONS },
  });

  const vectors = res.embeddings?.map((embedding) => embedding.values);
  if (
    !vectors ||
    vectors.length !== texts.length ||
    vectors.some((v) => !v?.length)
  ) {
    throw new Error(
      `Expected ${texts.length} embeddings, got ${vectors?.length ?? 0}`,
    );
  }
  return (vectors as number[][]).map(normalize);
};

/** Embeds chunks for storage, splitting into API-sized batches; order matches input. */
export const embedDocuments = async (texts: string[]): Promise<number[][]> => {
  const vectors: number[][] = [];
  for (let start = 0; start < texts.length; start += MAX_EMBED_BATCH) {
    const batch = texts.slice(start, start + MAX_EMBED_BATCH);
    vectors.push(...(await embedBatch(batch, "RETRIEVAL_DOCUMENT")));
  }
  return vectors;
};

/** Embeds a user's question; a different task type than documents, by design. */
export const embedQuery = async (text: string): Promise<number[]> => {
  const [vector] = await embedBatch([text], "RETRIEVAL_QUERY");
  return vector;
};
