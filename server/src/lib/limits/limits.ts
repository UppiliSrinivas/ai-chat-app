/**
 * Size caps shared by the routes that enforce them. Pure and separate from
 * the routes so the boundary arithmetic is testable without a database.
 */

/** User and assistant messages combined, not turns. */
export const MAX_MESSAGES_PER_CHAT = 100;

export const MAX_CHATS_PER_PROJECT = 10;

export const isChatFull = (messageCount: number): boolean => messageCount >= MAX_MESSAGES_PER_CHAT;

export const isProjectFull = (chatCount: number): boolean => chatCount >= MAX_CHATS_PER_PROJECT;
