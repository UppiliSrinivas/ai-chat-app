/** Full-text search over one person's own chats. The declaration is what the
 *  model reads; `searchMyChats` is what runs. */
import type { Types } from "mongoose";
import { Chat } from "../models/Chat.js";

export type SearchMyChatsArgs = { query: string };

export const searchMyChatsDeclaration = {
  name: "searchMyChats",
  description:
    "Search the user's own past conversations by keyword. Use this when they refer to something discussed earlier, ask what they said about a topic, or ask you to find a previous chat. Only ever searches their own chats. Matches any of the words given, so pass the whole topic at once. If nothing matches, tell the user — do not search again with different words.",
  parameters: {
    type: "object",
    properties: {
      query: {
        type: "string",
        description: 'A word or short phrase to look for — for example "kubernetes" or "tax deadline".',
      },
    },
    required: ["query"],
  },
} as const;

export type ChatMatch = {
  chatId: string;
  title: string;
  /** The text around the hit, so the model can say why a chat matched. */
  snippet: string;
  updatedAt: string;
};

export type SearchErrorCode = "QUERY_TOO_SHORT" | "SEARCH_FAILED";

/** A failed search is a normal outcome, not an exception: the model reads the
 *  `code` and explains itself rather than the chat stream dying. */
export type SearchMyChatsResult =
  | { ok: true; matches: ChatMatch[] }
  | { ok: false; code: SearchErrorCode; message: string };

/** One letter matches nearly every chat, which wastes a round trip and floods
 *  the model's context with noise. */
const MIN_QUERY_CHARS = 2;

/** Each match is fed back into the model and paid for by the token. */
const MAX_MATCHES = 5;

const SNIPPET_CHARS = 180;
const SNIPPET_LEAD = 60;

/** Mongo's shape stops here — only these fields are read, and nothing outside
 *  this file sees a document. */
type StoredChat = {
  _id: Types.ObjectId;
  title: string;
  updatedAt: Date;
  summary?: { text?: string };
  messages: { content: string }[];
};

const failure = (code: SearchErrorCode, message: string): SearchMyChatsResult => ({ ok: false, code, message });

const escapeRegex = (value: string): string => value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/** Any word, not the whole phrase: "React hooks" has to find a chat saying
 *  "hooks in React", or the model searches again and spends another round. */
const toWordPattern = (query: string): RegExp => {
  const words = query.split(/\s+/).filter((word) => word.length >= MIN_QUERY_CHARS);
  // Every word was too short to be worth matching on, so fall back to the
  // query itself rather than building an empty alternation that matches all.
  const parts = words.length > 0 ? words : [query];

  return new RegExp(parts.map(escapeRegex).join("|"), "i");
};

const snippetAround = (text: string, pattern: RegExp): string => {
  const hit = pattern.exec(text);
  if (!hit) return text.slice(0, SNIPPET_CHARS);

  const start = Math.max(0, hit.index - SNIPPET_LEAD);
  return text.slice(start, start + SNIPPET_CHARS);
};

/** Prefers the message that matched, so the snippet shows the hit rather than
 *  whatever the chat happened to open with. */
const toMatch = (chat: StoredChat, pattern: RegExp): ChatMatch => {
  const hit = chat.messages.find((message) => pattern.test(message.content));
  const source = hit?.content ?? chat.summary?.text ?? chat.title;

  return {
    chatId: chat._id.toString(),
    title: chat.title,
    snippet: snippetAround(source, pattern),
    updatedAt: chat.updatedAt.toISOString(),
  };
};

export const searchMyChats = async (
  { query }: SearchMyChatsArgs,
  userId: string,
): Promise<SearchMyChatsResult> => {
  const trimmed = query.trim();
  if (trimmed.length < MIN_QUERY_CHARS) {
    return failure("QUERY_TOO_SHORT", `Give at least ${MIN_QUERY_CHARS} characters to search for.`);
  }

  const pattern = toWordPattern(trimmed);

  try {
    // userId is part of the filter, never a check afterwards: another user's
    // chat is invisible here rather than found and then rejected.
    const chats = await Chat.find({
      userId,
      $or: [{ title: pattern }, { "messages.content": pattern }, { "summary.text": pattern }],
    })
      .sort({ updatedAt: -1 })
      .limit(MAX_MATCHES)
      .lean<StoredChat[]>();

    return { ok: true, matches: chats.map((chat) => toMatch(chat, pattern)) };
  } catch (error) {
    // Logged, not returned: the model gets a sentence it can explain while the
    // cause stays where an operator can read it.
    console.error(`[searchMyChats] "${trimmed}" failed:`, error);
    return failure("SEARCH_FAILED", "Your chats could not be searched right now.");
  }
};

/** The line shown in the chat while this call runs. */
export const describeSearchMyChatsCall = ({ query }: SearchMyChatsArgs): string => {
  const trimmed = query.trim();
  if (!trimmed) return "Searching your chats";
  return `Searching your chats for "${trimmed}"`;
};
