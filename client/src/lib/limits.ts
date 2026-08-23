/**
 * Display-only mirrors of the server's caps. The server is the enforcer —
 * these exist so the UI can swap a control before a request is refused.
 * Changing one without the other only affects when the UI switches, never
 * what the server accepts.
 */
export const MAX_MESSAGES_PER_CHAT = 100
export const MAX_CHATS_PER_PROJECT = 10
