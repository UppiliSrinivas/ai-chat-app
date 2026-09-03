/**
 * Size caps shared by the routes that enforce them. Pure and separate from the
 * routes so the boundary arithmetic is testable without a database.
 *
 * `client/src/lib/limits.ts` mirrors these numbers for display — change both.
 */

/**
 * Counts every token ever stored in a chat, not what gets sent to the model.
 * Compaction holds the sent total flat, so a cap on that would never be reached
 * and a chat would never end.
 */
export const MAX_CHAT_TOKENS = 20_000;

/** Unsummarized tokens that trigger the next fold. */
export const MAX_ACTIVE_TOKENS = 4_000;

export const MAX_CHATS_PER_PROJECT = 5;

/** Projects created today. Abuse protection, so it frees up tomorrow. */
export const MAX_PROJECTS_PER_DAY = 5;

export const isChatFull = (tokenCount: number): boolean => tokenCount >= MAX_CHAT_TOKENS;

export const isSummaryDue = (activeTokens: number): boolean => activeTokens >= MAX_ACTIVE_TOKENS;

export const isProjectFull = (chatCount: number): boolean => chatCount >= MAX_CHATS_PER_PROJECT;

export const isDailyProjectLimitReached = (createdToday: number): boolean =>
  createdToday >= MAX_PROJECTS_PER_DAY;

/**
 * Midnight UTC for the day the given moment falls in. The daily allowance needs
 * a fixed boundary, and UTC is the only one that does not shift under a user who
 * travels or a server that changes region.
 */
export const startOfUtcDay = (now: Date): Date =>
  new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
