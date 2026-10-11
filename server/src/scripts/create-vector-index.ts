/**
 * Creates the Atlas vector index chunk search needs, or updates it to the
 * current definition. Safe to re-run. Run from server/ so .env is found.
 */
import { connectMongo, disconnectMongo } from "../config/db.js";
import { Chunk, chunkVectorIndex } from "../models/Chunk.js";

await connectMongo();

try {
  // Atlas refuses a search index on a collection that doesn't exist yet.
  await Chunk.createCollection();

  const existing = await Chunk.listSearchIndexes();
  if (existing.some((index) => index.name === chunkVectorIndex.name)) {
    // The filter fields have changed before (projectId → chatId); an old index would silently filter on nothing.
    await Chunk.updateSearchIndex(chunkVectorIndex.name, chunkVectorIndex.definition);
    console.log(`[vector-index] updated "${chunkVectorIndex.name}"; Atlas rebuilds it in the background`);
  } else {
    await Chunk.createSearchIndex(chunkVectorIndex);
    console.log(`[vector-index] created "${chunkVectorIndex.name}"; Atlas builds it in the background`);
  }
} finally {
  await disconnectMongo();
}
