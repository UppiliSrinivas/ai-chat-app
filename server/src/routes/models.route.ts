import { Router } from "express";
import { modelCatalogue, resolveDefaultModel } from "../config/model-catalogue.js";
import { catalogueLimiter } from "../middleware/rateLimit.js";

const router = Router();

// Deliberately unauthenticated: it is a catalogue with nothing user-specific
// in it, and the picker renders before a guest account exists.
router.get("/", catalogueLimiter, async (_req, res) => {
  const models = await modelCatalogue.load();
  res.json({ models, defaultModel: resolveDefaultModel(models) });
});

export default router;
