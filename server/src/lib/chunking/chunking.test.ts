import { describe, expect, it } from "vitest";
import { CHARS_PER_TOKEN } from "../tokens/tokens.js";
import { CHUNK_TOKENS, MAX_CHUNK_TOKENS, OVERLAP_TOKENS, chunkText } from "./chunking.js";

/** A paragraph of roughly `tokens` tokens, made of numbered sentences. */
const paragraph = (tokens: number, label = "p"): string => {
  const sentences: string[] = [];
  let length = 0;
  for (let i = 0; length < tokens * CHARS_PER_TOKEN; i++) {
    const sentence = `${label} sentence ${i} is here.`;
    sentences.push(sentence);
    length += sentence.length + 1;
  }
  return sentences.join(" ");
};

describe("chunkText", () => {
  it("returns nothing for empty or blank text", () => {
    expect(chunkText("")).toEqual([]);
    expect(chunkText("  \n\n\t  ")).toEqual([]);
  });

  it("keeps short text as a single chunk", () => {
    expect(chunkText("Hello world.")).toEqual([{ text: "Hello world.", position: 0, tokens: 3 }]);
  });

  it("normalizes CRLF and collapses runs of blank lines", () => {
    const [chunk] = chunkText("one\r\ntwo\r\n\r\n\r\n\r\nthree");

    expect(chunk.text).toBe("one\ntwo\n\nthree");
  });

  it("packs small paragraphs into one chunk", () => {
    const chunks = chunkText(["alpha.", "beta.", "gamma."].join("\n\n"));

    expect(chunks).toHaveLength(1);
    expect(chunks[0].text).toBe("alpha.\n\nbeta.\n\ngamma.");
  });

  // Two paragraphs that don't fit together should split between them, not inside one.
  it("cuts at a paragraph boundary when one is available", () => {
    const first = paragraph(400, "first");
    const second = paragraph(400, "second");

    const chunks = chunkText(`${first}\n\n${second}`);

    expect(chunks).toHaveLength(2);
    expect(chunks[0].text).toBe(first);
    expect(chunks[1].text.endsWith(second)).toBe(true);
  });

  it("carries the end of each chunk into the start of the next", () => {
    const chunks = chunkText(paragraph(CHUNK_TOKENS * 3));
    const opening = chunks[1].text.slice(0, 50);

    expect(chunks.length).toBeGreaterThan(1);
    expect(chunks[0].text).toContain(opening);
  });

  it("hard-cuts text with no boundaries and stays under the limits", () => {
    const chunks = chunkText("x".repeat(CHUNK_TOKENS * CHARS_PER_TOKEN * 3));

    expect(chunks.length).toBeGreaterThan(1);
    for (const chunk of chunks) {
      expect(chunk.tokens).toBeLessThanOrEqual(CHUNK_TOKENS + OVERLAP_TOKENS);
      expect(chunk.tokens).toBeLessThan(MAX_CHUNK_TOKENS);
    }
  });

  it("loses no sentence across chunks", () => {
    const text = paragraph(CHUNK_TOKENS * 4);
    const joined = chunkText(text)
      .map((chunk) => chunk.text)
      .join(" ");

    for (const sentence of text.split(/(?<=\.) /)) {
      expect(joined).toContain(sentence);
    }
  });

  it("numbers chunks in order", () => {
    const chunks = chunkText(paragraph(CHUNK_TOKENS * 3));

    expect(chunks.map((chunk) => chunk.position)).toEqual(chunks.map((_, index) => index));
  });
});
