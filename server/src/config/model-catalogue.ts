import { createModelCatalogue, SEED_MODELS, type ChatModel } from "../lib/models/models.js";
import { env } from "./env.js";

const LIST_MODELS_URL = "https://generativelanguage.googleapis.com/v1beta/models";

/** Listing needs the same key the chat calls use; a bad key surfaces here as a
 *  failed fetch, which the catalogue already answers with the seed list. */
const fetchListModels = async (): Promise<unknown> => {
  const response = await fetch(
    `${LIST_MODELS_URL}?key=${encodeURIComponent(process.env.GEMINI_API_KEY ?? "")}&pageSize=200`,
  );

  if (!response.ok) throw new Error(`ListModels failed with status ${response.status}`);
  return response.json();
};

export const modelCatalogue = createModelCatalogue(fetchListModels);

/**
 * GEMINI_MODEL is the existing notion of "the model to use", so it stays the
 * default rather than a second setting that can drift from it. A value that is
 * no longer in the catalogue falls back to the first model that is.
 */
export const resolveDefaultModel = (models: ChatModel[]): string => {
  const configured = models.find((model) => model.id === env.geminiModel);
  if (configured) return configured.id;

  return models[0]?.id ?? SEED_MODELS[0]!.id;
};
