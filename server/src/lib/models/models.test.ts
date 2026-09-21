import { describe, expect, it, vi } from "vitest";
import {
  CATALOGUE_TTL_MS,
  SEED_MODELS,
  createModelCatalogue,
  toChatModels,
} from "./models.js";

/** Trimmed from a real ListModels response — one entry per family that the
 *  filter has to make a decision about. Low-context entries exercise the
 *  context floor; high-context entries test the pattern match itself. */
const listModelsPayload = {
  models: [
    { name: "models/gemini-3-flash-preview", displayName: "Gemini 3 Flash Preview", inputTokenLimit: 1048576, supportedGenerationMethods: ["generateContent"] },
    { name: "models/gemini-2.5-flash", displayName: "Gemini 2.5 Flash", inputTokenLimit: 1048576, supportedGenerationMethods: ["generateContent"] },
    { name: "models/gemma-4-31b-it", displayName: "Gemma 4 31B IT", inputTokenLimit: 262144, supportedGenerationMethods: ["generateContent"] },
    { name: "models/gemini-2.5-flash-preview-tts", displayName: "Gemini 2.5 Flash Preview TTS", inputTokenLimit: 8192, supportedGenerationMethods: ["generateContent"] },
    { name: "models/gemini-3-pro-image-preview", displayName: "Nano Banana Pro", inputTokenLimit: 131072, supportedGenerationMethods: ["generateContent"] },
    { name: "models/lyria-3.5", displayName: "Lyria 3.5", inputTokenLimit: 1048576, supportedGenerationMethods: ["generateContent"] },
    { name: "models/gemini-3.5-transcribe", displayName: "Gemini 3.5 Transcribe", inputTokenLimit: 98304, supportedGenerationMethods: ["generateContent"] },
    { name: "models/gemini-robotics-er-2-preview", displayName: "Gemini Robotics-ER 2 Preview", inputTokenLimit: 131072, supportedGenerationMethods: ["generateContent"] },
    { name: "models/antigravity-preview-09-2026", displayName: "Antigravity Agent Preview", inputTokenLimit: 1048576, supportedGenerationMethods: ["generateContent"] },
    { name: "models/deep-research-preview-04-2026", displayName: "Deep Research Preview", inputTokenLimit: 131072, supportedGenerationMethods: ["generateContent"] },
    { name: "models/embedding-001", displayName: "Embedding 001", inputTokenLimit: 2048, supportedGenerationMethods: ["embedContent"] },
    // High-context variants for pattern matching verification
    { name: "models/gemini-3.1-flash-tts-preview", displayName: "Gemini 3.1 Flash TTS Preview", inputTokenLimit: 1048576, supportedGenerationMethods: ["generateContent"] },
    { name: "models/gemini-3.5-transcribe-pro", displayName: "Gemini 3.5 Transcribe Pro", inputTokenLimit: 262144, supportedGenerationMethods: ["generateContent"] },
    { name: "models/gemini-2.5-computer-use-preview-10-2025", displayName: "Gemini 2.5 Computer Use Preview", inputTokenLimit: 131072, supportedGenerationMethods: ["generateContent"] },
    { name: "models/gemini-nano-banana-preview", displayName: "Gemini Nano Banana Preview", inputTokenLimit: 131072, supportedGenerationMethods: ["generateContent"] },
  ],
};

const idsOf = (models: { id: string }[]) => models.map((model) => model.id);

describe("toChatModels", () => {
  it("keeps the real chat models", () => {
    expect(idsOf(toChatModels(listModelsPayload))).toEqual([
      "gemini-3-flash-preview",
      "gemini-2.5-flash",
      "gemma-4-31b-it",
    ]);
  });

  it("drops models that cannot generate text at all", () => {
    expect(idsOf(toChatModels(listModelsPayload))).not.toContain("embedding-001");
  });

  it.each([
    ["speech (low context)", "gemini-2.5-flash-preview-tts"],
    ["image", "gemini-3-pro-image-preview"],
    ["music", "lyria-3.5"],
    ["transcription (low context)", "gemini-3.5-transcribe"],
    ["robotics", "gemini-robotics-er-2-preview"],
    ["agent", "antigravity-preview-09-2026"],
    ["deep research", "deep-research-preview-04-2026"],
    ["speech (high context)", "gemini-3.1-flash-tts-preview"],
    ["transcription (high context)", "gemini-3.5-transcribe-pro"],
    ["computer-use", "gemini-2.5-computer-use-preview-10-2025"],
    ["nano-banana", "gemini-nano-banana-preview"],
  ])("drops the %s model, which also advertises generateContent", (_label, id) => {
    expect(idsOf(toChatModels(listModelsPayload))).not.toContain(id);
  });

  // The suffix list cannot know about a family we have never seen, so the
  // context floor is the second line of defence.
  it("drops an unknown family whose context is too small for chat", () => {
    const raw = { models: [{ name: "models/gemini-9-whisper", displayName: "Whisper", inputTokenLimit: 8192, supportedGenerationMethods: ["generateContent"] }] };
    expect(toChatModels(raw)).toEqual([]);
  });

  it("reports tool support for gemini and withholds it from gemma", () => {
    const models = toChatModels(listModelsPayload);
    expect(models.find((model) => model.id === "gemini-2.5-flash")?.supportsTools).toBe(true);
    expect(models.find((model) => model.id === "gemma-4-31b-it")?.supportsTools).toBe(false);
  });

  it("strips the models/ prefix and carries the display name and context", () => {
    const [first] = toChatModels(listModelsPayload);
    expect(first).toEqual({
      id: "gemini-3-flash-preview",
      name: "Gemini 3 Flash Preview",
      contextLength: 1048576,
      supportsTools: true,
    });
  });

  it.each([[null], [undefined], [{}], [{ models: "nope" }], [{ models: [null] }]])(
    "returns an empty list rather than throwing on %s",
    (raw) => {
      expect(toChatModels(raw)).toEqual([]);
    },
  );

  it("covers all NON_CHAT_PATTERNS with at least one high-context fixture", () => {
    const patterns = [
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

    const fixtureIds = listModelsPayload.models
      .filter((m) => m.inputTokenLimit >= 100_000)
      .map((m) => m.name.replace(/^models\//, ""));

    for (const pattern of patterns) {
      const covered = fixtureIds.some((id) => id.includes(pattern));
      expect(covered, `Pattern "${pattern}" not covered by any high-context fixture`).toBe(true);
    }
  });
});

describe("createModelCatalogue", () => {
  it("fetches once and serves the cache until the ttl expires", async () => {
    const fetchModels = vi.fn().mockResolvedValue(listModelsPayload);
    let clock = 1_000;
    const catalogue = createModelCatalogue(fetchModels, () => clock);

    await catalogue.load();
    clock += CATALOGUE_TTL_MS - 1;
    await catalogue.load();

    expect(fetchModels).toHaveBeenCalledTimes(1);
  });

  it("refetches once the ttl has passed", async () => {
    const fetchModels = vi.fn().mockResolvedValue(listModelsPayload);
    let clock = 1_000;
    const catalogue = createModelCatalogue(fetchModels, () => clock);

    await catalogue.load();
    clock += CATALOGUE_TTL_MS;
    await catalogue.load();

    expect(fetchModels).toHaveBeenCalledTimes(2);
  });

  // A stale catalogue is still a usable picker; an empty one is a dead end.
  it("serves the stale list when a refetch fails", async () => {
    const fetchModels = vi
      .fn()
      .mockResolvedValueOnce(listModelsPayload)
      .mockRejectedValueOnce(new Error("network down"));
    let clock = 1_000;
    const catalogue = createModelCatalogue(fetchModels, () => clock);

    const fresh = await catalogue.load();
    clock += CATALOGUE_TTL_MS;

    expect(await catalogue.load()).toEqual(fresh);
  });

  it("falls back to the seed list when the very first fetch fails", async () => {
    const catalogue = createModelCatalogue(vi.fn().mockRejectedValue(new Error("network down")));

    expect(await catalogue.load()).toEqual(SEED_MODELS);
  });

  it("falls back to the seed list when the response has no usable models", async () => {
    const catalogue = createModelCatalogue(vi.fn().mockResolvedValue({ models: [] }));

    expect(await catalogue.load()).toEqual(SEED_MODELS);
  });

  // Two requests landing on a cold cache must not both hit Google.
  it("shares one in-flight fetch between concurrent callers", async () => {
    const fetchModels = vi.fn().mockResolvedValue(listModelsPayload);
    const catalogue = createModelCatalogue(fetchModels);

    await Promise.all([catalogue.load(), catalogue.load()]);

    expect(fetchModels).toHaveBeenCalledTimes(1);
  });
});
