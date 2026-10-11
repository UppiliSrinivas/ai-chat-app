import { Types } from "mongoose";
import { describe, expect, it } from "vitest";
import { Upload } from "./Upload.js";

const userId = new Types.ObjectId();
const valid = { userId, chatId: new Types.ObjectId(), name: "notes.pdf", mimeType: "application/pdf", sizeBytes: 1024 };

describe("Upload schema", () => {
  it("starts processing with no chunks", () => {
    const upload = new Upload(valid);

    expect(upload.validateSync()).toBeUndefined();
    expect(upload.status).toBe("processing");
    expect(upload.chunkCount).toBe(0);
    expect(upload.failureCode).toBeNull();
  });

  it("accepts a known failure code", () => {
    const upload = new Upload({ ...valid, status: "failed", failureCode: "EMPTY_TEXT" });

    expect(upload.validateSync()).toBeUndefined();
  });

  it("refuses an unknown failure code", () => {
    const error = new Upload({ ...valid, failureCode: "OOPS" }).validateSync();

    expect(error?.errors.failureCode).toBeDefined();
  });

  it("trims the file name", () => {
    expect(new Upload({ ...valid, name: "  notes.pdf  " }).name).toBe("notes.pdf");
  });

  // Every query filters by userId, so an upload without one would be unreachable.
  it("refuses an upload with no owner", () => {
    const { userId: _omitted, ...withoutOwner } = valid;

    expect(new Upload(withoutOwner).validateSync()?.errors.userId).toBeDefined();
  });

  // Only the chat it was attached in can search it, so it must have one.
  it("refuses an upload with no chat", () => {
    const { chatId: _omitted, ...withoutChat } = valid;

    expect(new Upload(withoutChat).validateSync()?.errors.chatId).toBeDefined();
  });

  it("refuses a file type ingestion can't parse", () => {
    const error = new Upload({ ...valid, mimeType: "image/png" }).validateSync();

    expect(error?.errors.mimeType).toBeDefined();
  });

  it("refuses an unknown status", () => {
    expect(new Upload({ ...valid, status: "done" }).validateSync()?.errors.status).toBeDefined();
  });

  it("refuses a negative size", () => {
    expect(new Upload({ ...valid, sizeBytes: -1 }).validateSync()?.errors.sizeBytes).toBeDefined();
  });

  it("indexes userId and chatId, since queries filter on both", () => {
    expect(Upload.schema.path("userId").options.index).toBe(true);
    expect(Upload.schema.path("chatId").options.index).toBe(true);
  });
});
