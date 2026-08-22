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
