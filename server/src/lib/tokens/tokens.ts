/**
 * Gemini reports exact counts once a call completes, but every decision that
 * depends on size — summarize now? is this chat full? — has to be made before
 * the call. This stands in where no real count exists yet.
 */

const CHARS_PER_TOKEN = 4;

export const estimateTokens = (text: string): number =>
  text.length === 0 ? 0 : Math.ceil(text.length / CHARS_PER_TOKEN);

export type PricedText = { content: string; tokens?: number };

/** Prefers the count the API gave us; estimates only what was never priced. */
export const sumTokens = (items: PricedText[]): number =>
  items.reduce((total, item) => total + (item.tokens ?? estimateTokens(item.content)), 0);
