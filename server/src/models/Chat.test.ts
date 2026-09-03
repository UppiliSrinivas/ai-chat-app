import { Types } from "mongoose";
import { describe, expect, it } from "vitest";
import { Chat, isValidObjectId } from "./Chat.js";

const userId = new Types.ObjectId();

describe("Chat schema", () => {
  it("defaults a new chat to an empty transcript titled 'New chat'", () => {
    const chat = new Chat({ userId });

    expect(chat.validateSync()).toBeUndefined();
    expect(chat.title).toBe("New chat");
    expect(chat.messages).toEqual([]);
  });

  // Every query filters by userId, so a chat without one would be unreachable
  // and invisible to its owner rather than merely wrong.
  it("refuses a chat with no owner", () => {
    const error = new Chat({ title: "Orphan" }).validateSync();

    expect(error?.errors.userId).toBeDefined();
  });

  it("accepts user and assistant turns", () => {
    const chat = new Chat({
      userId,
      messages: [
        { role: "user", content: "hello" },
        { role: "assistant", content: "hi" },
      ],
    });

    expect(chat.validateSync()).toBeUndefined();
    expect(chat.messages).toHaveLength(2);
  });

  // Gemini calls assistant turns "model"; the wire format is mapped in
  // history.ts, so anything but these two reaching the database is a bug.
  it.each(["model", "system", ""])("rejects the role %s", (role) => {
    const error = new Chat({ userId, messages: [{ role, content: "x" }] }).validateSync();

    expect(error?.errors["messages.0.role"]).toBeDefined();
  });

  it("requires content on every message", () => {
    const error = new Chat({ userId, messages: [{ role: "user" }] }).validateSync();

    expect(error?.errors["messages.0.content"]).toBeDefined();
  });

  // Embedded messages carry no _id — they are addressed by position, and the
  // extra ObjectId per message is pure weight in a document already capped.
  it("does not give embedded messages their own _id", () => {
    const chat = new Chat({ userId, messages: [{ role: "user", content: "hello" }] });

    expect(chat.messages[0]).not.toHaveProperty("_id");
  });

  // A chat with no projectId is standalone. Defaulting to null rather than
  // leaving it undefined means the client always gets the field back.
  it("defaults projectId to null so a chat is standalone", () => {
    const chat = new Chat({ userId });

    expect(chat.validateSync()).toBeUndefined();
    expect(chat.projectId).toBeNull();
  });

  it("accepts a chat assigned to a project", () => {
    const projectId = new Types.ObjectId();
    const chat = new Chat({ userId, projectId });

    expect(chat.validateSync()).toBeUndefined();
    expect(chat.projectId?.toString()).toBe(projectId.toString());
  });

  it("indexes projectId, since the project view filters on it", () => {
    expect(Chat.schema.path("projectId").options.index).toBe(true);
  });
});

describe("isValidObjectId", () => {
  it("accepts a real ObjectId", () => {
    expect(isValidObjectId(userId.toString())).toBe(true);
  });

  // Routes call this before querying so a malformed id answers 400 rather
  // than throwing a CastError out of Mongoose.
  it.each(["", "not-an-id", "12345", "zzzzzzzzzzzzzzzzzzzzzzzz"])("rejects %s", (value) => {
    expect(isValidObjectId(value)).toBe(false);
  });
});

describe("Chat summary", () => {
  // Absent rather than zeroed, so chats written before summarization existed
  // read as "never summarized" without a migration.
  it("leaves a new chat unsummarized", () => {
    const chat = new Chat({ userId });

    expect(chat.validateSync()).toBeUndefined();
    expect(chat.summary?.text ?? "").toBe("");
    expect(chat.summary?.throughMessageCount ?? 0).toBe(0);
  });

  it("stores a summary and how far it reaches", () => {
    const chat = new Chat({
      userId,
      summary: { text: "They discussed vector databases.", throughMessageCount: 10 },
    });

    expect(chat.validateSync()).toBeUndefined();
    expect(chat.summary?.text).toBe("They discussed vector databases.");
    expect(chat.summary?.throughMessageCount).toBe(10);
  });

  // The count drives an array slice, so a negative would slice from the end
  // and silently feed the model the wrong messages.
  it("refuses a negative reach", () => {
    const error = new Chat({
      userId,
      summary: { text: "x", throughMessageCount: -1 },
    }).validateSync();

    expect(error?.errors["summary.throughMessageCount"]).toBeDefined();
  });

  // Counts consecutive failures so a chat that cannot be summarized stops
  // being retried on every single message.
  it("tracks failed attempts", () => {
    const chat = new Chat({ userId, summary: { text: "", throughMessageCount: 0, failedAttempts: 2 } });

    expect(chat.validateSync()).toBeUndefined();
    expect(chat.summary?.failedAttempts).toBe(2);
  });
});

describe("Chat token accounting", () => {
  // The chat cap counts everything ever stored, and compaction stops us ever
  // sending it all in one call, so no API response can report this total.
  it("starts a new chat at zero tokens", () => {
    const chat = new Chat({ userId });

    expect(chat.validateSync()).toBeUndefined();
    expect(chat.tokenCount).toBe(0);
  });

  it("carries a running total for the chat", () => {
    const chat = new Chat({ userId, tokenCount: 4200 });

    expect(chat.validateSync()).toBeUndefined();
    expect(chat.tokenCount).toBe(4200);
  });

  it("prices each message so the active window can be summed", () => {
    const chat = new Chat({
      userId,
      messages: [{ role: "user", content: "hello", tokens: 2 }],
    });

    expect(chat.validateSync()).toBeUndefined();
    expect(chat.messages[0]?.tokens).toBe(2);
  });

  // An unpriced message reads as zero rather than undefined, so a sum over the
  // window can never come back NaN and silently disable the trigger.
  it("defaults an unpriced message to zero rather than nothing", () => {
    const chat = new Chat({ userId, messages: [{ role: "user", content: "hello" }] });

    expect(chat.messages[0]?.tokens).toBe(0);
  });

  it.each([
    ["tokenCount", { userId, tokenCount: -1 }],
    ["message tokens", { userId, messages: [{ role: "user", content: "x", tokens: -5 }] }],
  ])("refuses a negative %s", (_label, doc) => {
    expect(new Chat(doc).validateSync()).toBeDefined();
  });
});
