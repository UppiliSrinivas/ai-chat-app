import { Schema, model, Types, type InferSchemaType } from "mongoose";

/**
 * Messages are embedded directly in the chat document rather than living in
 * their own collection. The existing chat-request validation already caps a
 * conversation at 80 turns / 120k chars before it ever reaches Gemini, so a
 * chat document stays far under MongoDB's 16MB limit — and embedding means
 * "load a chat" is one query instead of a join. Revisit only if cross-chat
 * search or per-message analytics become a real requirement.
 */
const messageSchema = new Schema(
  {
    role: { type: String, enum: ["user", "assistant"], required: true },
    content: { type: String, required: true },
    // Exact for assistant turns, which the API prices for us; estimated for
    // user turns, which nothing can price before they are sent.
    tokens: { type: Number, default: 0, min: 0 },
  },
  { timestamps: { createdAt: true, updatedAt: false }, _id: false },
);

/**
 * A rolling summary of the messages already folded into it. `throughMessageCount`
 * is an index into `messages`, not a timestamp, so it cannot drift out of step
 * with the array it describes. `failedAttempts` stops a chat that cannot be
 * summarized from retrying on every single message.
 */
const summarySchema = new Schema(
  {
    text: { type: String, default: "" },
    throughMessageCount: { type: Number, default: 0, min: 0 },
    failedAttempts: { type: Number, default: 0, min: 0 },
  },
  { _id: false },
);

const chatSchema = new Schema(
  {
    userId: { type: Schema.Types.ObjectId, ref: "User", required: true, index: true },
    // Null means standalone. Optional rather than required so existing chats
    // keep working without a migration.
    projectId: { type: Schema.Types.ObjectId, ref: "Project", default: null, index: true },
    title: { type: String, default: "New chat" },
    messages: { type: [messageSchema], default: [] },
    // Absent until the first summarize runs, so chats written before this
    // existed read as "never summarized" with no migration.
    summary: { type: summarySchema, default: undefined },
    // Everything ever stored, which is what the chat cap measures. Compaction
    // stops the whole transcript ever being sent, so no API response reports it.
    tokenCount: { type: Number, default: 0, min: 0 },
  },
  { timestamps: true },
);

export type ChatDoc = InferSchemaType<typeof chatSchema>;

export const Chat = model("Chat", chatSchema);

export const isValidObjectId = (value: string): boolean => Types.ObjectId.isValid(value);
