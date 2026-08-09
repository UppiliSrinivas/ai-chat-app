import mongoose from "mongoose";
import { env, isMongoConfigured } from "./env.js";

/**
 * A single mongoose connection, established once at boot.
 *
 * Mirrors the gemini config's fail-loudly stance: a server that can't reach
 * its database is misconfigured, not degraded, so callers should let boot
 * fail rather than start accepting requests they can't fulfill.
 */
export const connectMongo = async (): Promise<void> => {
  if (!isMongoConfigured) {
    throw new Error("MONGODB_URI is not set. Set it in server/.env.");
  }

  mongoose.connection.on("error", (error) => {
    console.error("[mongo] connection error:", error);
  });

  // Default server-selection timeout is 30s — fine for transient blips once
  // running, but a genuinely misconfigured URI at boot should fail fast
  // instead of stalling deploys/health checks for half a minute.
  await mongoose.connect(env.mongoUri, { serverSelectionTimeoutMS: 5000 });
};

export const disconnectMongo = async (): Promise<void> => {
  await mongoose.disconnect();
};
