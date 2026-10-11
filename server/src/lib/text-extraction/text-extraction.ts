/**
 * Turns an uploaded file into plain text. The PDF library's shape stops here,
 * so swapping it touches only this module.
 */
import { extractText as extractPdfPages } from "unpdf";

export const EXTRACTABLE_MIME_TYPES = ["application/pdf", "text/plain", "text/markdown"] as const;
export type ExtractableMimeType = (typeof EXTRACTABLE_MIME_TYPES)[number];

const MIME_BY_EXTENSION: Record<string, ExtractableMimeType> = {
  pdf: "application/pdf",
  txt: "text/plain",
  md: "text/markdown",
  markdown: "text/markdown",
};

const isExtractable = (mimeType: string): mimeType is ExtractableMimeType =>
  (EXTRACTABLE_MIME_TYPES as readonly string[]).includes(mimeType);

/**
 * Browsers report .md as "", "text/x-markdown" or "application/octet-stream",
 * so the extension decides first and the reported type is only a fallback.
 */
export const resolveMimeType = (fileName: string, reportedType: string): ExtractableMimeType | null => {
  const extension = fileName.split(".").pop()?.toLowerCase() ?? "";
  const byExtension = MIME_BY_EXTENSION[extension];
  if (byExtension) return byExtension;
  if (isExtractable(reportedType)) return reportedType;
  return null;
};

export const extractText = async (bytes: Uint8Array, mimeType: ExtractableMimeType): Promise<string> => {
  if (mimeType !== "application/pdf") return new TextDecoder("utf-8").decode(bytes);

  // PDF.js detaches the buffer it's given, so it gets a copy, not the caller's.
  const { text: pages } = await extractPdfPages(new Uint8Array(bytes), { mergePages: false });
  // A blank line between pages lets the chunker treat a page break as a paragraph.
  return pages.join("\n\n");
};
