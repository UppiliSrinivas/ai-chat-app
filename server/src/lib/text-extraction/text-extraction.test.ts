import { beforeEach, describe, expect, it, vi } from "vitest";

const extractPdfPages = vi.hoisted(() => vi.fn());
vi.mock("unpdf", () => ({ extractText: extractPdfPages }));

import { extractText, resolveMimeType } from "./text-extraction.js";

const bytesOf = (text: string) => new TextEncoder().encode(text);

beforeEach(() => {
  extractPdfPages.mockReset();
});

describe("resolveMimeType", () => {
  it.each([
    ["report.pdf", "application/pdf"],
    ["notes.txt", "text/plain"],
    ["README.md", "text/markdown"],
    ["guide.markdown", "text/markdown"],
    ["SHOUTING.PDF", "application/pdf"],
  ])("maps %s by its extension", (fileName, expected) => {
    expect(resolveMimeType(fileName, "")).toBe(expected);
  });

  // Browsers often send a generic type for .md files.
  it("trusts the extension over a generic reported type", () => {
    expect(resolveMimeType("notes.md", "application/octet-stream")).toBe("text/markdown");
  });

  it("falls back to the reported type when the extension is unknown", () => {
    expect(resolveMimeType("notes", "text/plain")).toBe("text/plain");
  });

  it("refuses a file it can't extract", () => {
    expect(resolveMimeType("photo.png", "image/png")).toBeNull();
  });
});

describe("extractText", () => {
  it("decodes plain text and Markdown as UTF-8", async () => {
    expect(await extractText(bytesOf("héllo ✓"), "text/plain")).toBe("héllo ✓");
    expect(await extractText(bytesOf("# Title"), "text/markdown")).toBe("# Title");
    expect(extractPdfPages).not.toHaveBeenCalled();
  });

  it("joins PDF pages with a blank line so each page break is a paragraph", async () => {
    extractPdfPages.mockResolvedValue({ totalPages: 2, text: ["page one", "page two"] });

    expect(await extractText(bytesOf("%PDF"), "application/pdf")).toBe("page one\n\npage two");
  });

  it("hands the PDF library a copy, leaving the caller's bytes intact", async () => {
    extractPdfPages.mockResolvedValue({ totalPages: 1, text: [""] });
    const bytes = bytesOf("%PDF");

    await extractText(bytes, "application/pdf");

    const [given] = extractPdfPages.mock.calls[0];
    expect(given).toEqual(bytes);
    expect(given).not.toBe(bytes);
  });

  it("lets a corrupt PDF's error reach the caller", async () => {
    extractPdfPages.mockRejectedValue(new Error("Invalid PDF structure"));

    await expect(extractText(bytesOf("junk"), "application/pdf")).rejects.toThrow("Invalid PDF");
  });
});
