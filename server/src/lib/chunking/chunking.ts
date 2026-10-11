/**
 * Splits a document into embedding-sized chunks. Pure: no API or DB calls.
 * Examples follow one input, "Cats sleep a lot.\r\n\r\n\r\nDogs love to play fetch. They also bark at night.",
 * with pretend limits: chunk = 10 tokens (40 chars), overlap = 3 tokens (12 chars).
 */
import { CHARS_PER_TOKEN, estimateTokens } from "../tokens/tokens.js";

export const CHUNK_TOKENS = 600;
/** Repeated at the start of the next chunk so an answer spanning a cut isn't lost. */
export const OVERLAP_TOKENS = 80;
/** gemini-embedding-001 rejects longer inputs. */
export const MAX_CHUNK_TOKENS = 2048;

export type Chunk = { text: string; position: number; tokens: number };

// Coarsest first. Lookbehind keeps each separator on its piece, so no text is lost.
const BOUNDARIES = [/(?<=\n\n)/, /(?<=\n)/, /(?<=[.!?] )/];

/**
 * Step 1: CRLF -> \n, 3+ newlines -> one blank line, trim.
 * "Cats sleep a lot.\r\n\r\n\r\nDogs..." -> "Cats sleep a lot.\n\nDogs..."
 */
const normalizeText = (text: string): string =>
  text.replace(/\r\n?/g, "\n").replace(/\n{3,}/g, "\n\n").trim();

/**
 * Step 2: does it fit? Tokens = chars / 4.
 * Whole text: 68 chars = 17 tokens -> false. "Cats sleep a lot.\n\n": 5 tokens -> true.
 */
const fitsInChunk = (text: string): boolean => estimateTokens(text) <= CHUNK_TOKENS;

/**
 * Last resort for text with no breaks; our example never reaches it.
 * cutEvery("aaaaabbbbbcc", 5) -> ["aaaaa", "bbbbb", "cc"]
 */
const cutEvery = (text: string, size: number): string[] => {
  const pieces: string[] = [];
  for (let start = 0; start < text.length; start += size) {
    pieces.push(text.slice(start, start + size));
  }
  return pieces;
};

/**
 * Step 3: split paragraphs -> lines -> sentences -> cutEvery until every piece fits.
 * -> ["Cats sleep a lot.\n\n", "Dogs love to play fetch. ", "They also bark at night."]
 */
const splitToFit = (text: string, boundaries = BOUNDARIES): string[] => {
  if (fitsInChunk(text)) return [text];

  const [boundary, ...finer] = boundaries;
  if (!boundary) return cutEvery(text, CHUNK_TOKENS * CHARS_PER_TOKEN);

  return text.split(boundary).flatMap((part) => splitToFit(part, finer));
};

/**
 * Last 12 chars of a chunk, moved forward to a whole word.
 * "Cats sleep a lot.\n\n" -> "eep a lot.\n\n" -> "a lot.\n\n"
 */
const overlapTail = (chunk: string): string => {
  const tail = chunk.slice(-OVERLAP_TOKENS * CHARS_PER_TOKEN);
  const firstSpace = tail.indexOf(" ");
  if (firstSpace === -1) return tail;
  return tail.slice(firstSpace + 1);
};

/**
 * Step 4: join pieces until the next won't fit, then save and carry the overlapTail.
 * -> ["Cats sleep a lot.\n\n", "a lot.\n\nDogs love to play fetch. ", "fetch. They also bark at night."]
 */
const packPieces = (pieces: string[]): string[] => {
  const chunks: string[] = [];
  let current = "";

  for (const piece of pieces) {
    if (current && !fitsInChunk(current + piece)) {
      chunks.push(current);
      current = overlapTail(current);
    }
    current += piece;
  }

  chunks.push(current);
  return chunks;
};

/**
 * Step 5: run all steps, trim, drop empties, number. Overlap repeats "a lot." and "fetch.".
 * -> [{ position: 0, text: "Cats sleep a lot.", tokens: 5 }, { position: 1, ... }, { position: 2, ... }]
 */
export const chunkText = (text: string): Chunk[] => {
  const normalized = normalizeText(text);
  if (!normalized) return [];

  return packPieces(splitToFit(normalized))
    .map((chunk) => chunk.trim())
    .filter((chunk) => chunk.length > 0)
    .map((chunk, position) => ({ text: chunk, position, tokens: estimateTokens(chunk) }));
};
