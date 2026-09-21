/**
 * The catalogue of Gemini models a user may pick from.
 *
 * Google's ListModels shape stops here: nothing outside this module sees a
 * `models/…` name or a `supportedGenerationMethods` array.
 */

export type ChatModel = {
  id: string;
  name: string;
  contextLength: number;
  supportsTools: boolean;
};

export type FetchListModels = () => Promise<unknown>;

/** `generateContent` also matches speech, image, music, transcription,
 *  robotics and research models, none of which belong in a chat picker. */
const NON_CHAT_PATTERNS = [
  "-tts",
  "-image",
  "nano-banana",
  "lyria",
  "transcribe",
  "robotics",
  "computer-use",
  "deep-research",
  "antigravity",
];

/** Every non-chat model above sits far below this and every chat model far
 *  above it, so it catches a new family whose name we cannot know yet. */
const MIN_CONTEXT_LENGTH = 100_000;

/** ListModels does not report function-calling support, so it is derived from
 *  the family. Gemma is an open-weights release with no tool calling. */
const TOOL_CAPABLE_PREFIX = "gemini-";

export const CATALOGUE_TTL_MS = 6 * 60 * 60 * 1000;

/** Served only when the very first fetch fails, so the picker is never empty
 *  and a new chat is never blocked on Google being reachable. */
export const SEED_MODELS: ChatModel[] = [
  { id: "gemini-3-flash-preview", name: "Gemini 3 Flash Preview", contextLength: 1_048_576, supportsTools: true },
  { id: "gemini-2.5-flash", name: "Gemini 2.5 Flash", contextLength: 1_048_576, supportsTools: true },
  { id: "gemini-2.5-flash-lite", name: "Gemini 2.5 Flash-Lite", contextLength: 1_048_576, supportsTools: true },
];

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const isChatId = (id: string): boolean =>
  !NON_CHAT_PATTERNS.some((pattern) => id.includes(pattern));

const toChatModel = (entry: unknown): ChatModel | null => {
  if (!isRecord(entry)) return null;

  const { name, displayName, inputTokenLimit, supportedGenerationMethods } = entry;

  if (typeof name !== "string") return null;
  if (!Array.isArray(supportedGenerationMethods)) return null;
  if (!supportedGenerationMethods.includes("generateContent")) return null;
  if (typeof inputTokenLimit !== "number" || inputTokenLimit < MIN_CONTEXT_LENGTH) return null;

  const id = name.replace(/^models\//, "");
  if (!isChatId(id)) return null;

  return {
    id,
    name: typeof displayName === "string" && displayName ? displayName : id,
    contextLength: inputTokenLimit,
    supportsTools: id.startsWith(TOOL_CAPABLE_PREFIX),
  };
};

export const toChatModels = (raw: unknown): ChatModel[] => {
  if (!isRecord(raw) || !Array.isArray(raw.models)) return [];

  return raw.models
    .map(toChatModel)
    .filter((model): model is ChatModel => model !== null);
};

/**
 * A factory rather than a module-level cache: a shared mutable map would leak
 * between tests and make "what does a cold start do" impossible to assert.
 */
export const createModelCatalogue = (
  fetchModels: FetchListModels,
  now: () => number = Date.now,
) => {
  let cached: { models: ChatModel[]; at: number } | null = null;
  let inFlight: Promise<ChatModel[]> | null = null;

  const refresh = async (): Promise<ChatModel[]> => {
    try {
      const models = toChatModels(await fetchModels());
      if (models.length === 0) return cached?.models ?? SEED_MODELS;

      cached = { models, at: now() };
      return models;
    } catch {
      // Stale is still a usable picker; empty is a dead end.
      return cached?.models ?? SEED_MODELS;
    }
  };

  return {
    load: async (): Promise<ChatModel[]> => {
      if (cached && now() - cached.at < CATALOGUE_TTL_MS) return cached.models;

      // Two requests arriving on a cold cache must not both hit Google.
      inFlight ??= refresh().finally(() => {
        inFlight = null;
      });

      return inFlight;
    },
  };
};
