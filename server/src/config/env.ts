import { resolve } from "node:path";
import dotenv from "dotenv";

// Resolved from cwd, so the server must be started from `server/`.
dotenv.config({ path: resolve(process.cwd(), ".env") });

const readInt = (value: string | undefined, fallback: number): number => {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? Math.floor(parsed) : fallback;
};

const readList = (value: string | undefined, fallback: string[]): string[] => {
  const entries = (value ?? "")
    .split(",")
    .map((entry) => entry.trim())
    .filter(Boolean);

  return entries.length > 0 ? entries : fallback;
};

export const env = {
  port: readInt(process.env.PORT, 5000),
  nodeEnv: process.env.NODE_ENV ?? "development",

  /** Origins allowed to call the API. Never widen this to "*" — the server
   *  holds the provider keys, so any origin that can reach it spends them. */
  corsOrigins: readList(process.env.CORS_ORIGIN, ["http://localhost:5173"]),

  geminiModel: process.env.GEMINI_MODEL ?? "gemini-3-flash-preview",

  /** Required. No fallback — connecting to an unconfigured/default DB silently
   *  would be worse than failing loudly at boot, same reasoning as the Gemini key. */
  mongoUri: process.env.MONGODB_URI ?? "",

  /** Signs auth session JWTs. Required for the same reason: an empty/default
   *  secret would make every issued session forgeable. */
  jwtSecret: process.env.JWT_SECRET ?? "",

  jwtExpiresIn: process.env.JWT_EXPIRES_IN ?? "7d",
} as const;

export const isMongoConfigured = env.mongoUri.length > 0;
export const isAuthConfigured = env.jwtSecret.length > 0;
