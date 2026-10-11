import { describe, expect, it } from "vitest";
import type { ChatModel } from "../lib/models/models.js";
import { SEED_MODELS } from "../lib/models/models.js";
import { resolveDefaultModel } from "./model-catalogue.js";
import { env } from "./env.js";

const buildModel = (id: string): ChatModel => ({
  id,
  name: id,
  contextLength: 1_048_576,
  supportsTools: true,
});

// Sourced from the real env rather than a hardcoded id, so this test does not
// drift from whatever GEMINI_MODEL actually resolves to in this run.
describe("resolveDefaultModel", () => {
  it("returns the configured model when the catalogue carries it", () => {
    const models = [buildModel("some-other-model"), buildModel(env.geminiModel)];

    expect(resolveDefaultModel(models)).toBe(env.geminiModel);
  });

  it("falls back to the first catalogue model when the configured one is absent", () => {
    const models = [buildModel("model-a"), buildModel("model-b")];

    expect(resolveDefaultModel(models)).toBe("model-a");
  });

  it("falls back to the first seed model when the catalogue is empty", () => {
    expect(resolveDefaultModel([])).toBe(SEED_MODELS[0]!.id);
  });
});
