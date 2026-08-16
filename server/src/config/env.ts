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

const nodeEnv = process.env.NODE_ENV ?? "development";

export const env = {
  port: readInt(process.env.PORT, 5000),
  nodeEnv,

  /** Origins allowed to call the API, picked by NODE_ENV like the Mongo URI
   *  above. Never widen this to "*" — the server holds the provider keys, so
   *  any origin that can reach it spends them. */
  corsOrigins: readList(
    nodeEnv === "production" ? process.env.CORS_ORIGIN_PROD : process.env.CORS_ORIGIN_DEV,
    ["http://localhost:5173"],
  ),

  geminiModel: process.env.GEMINI_MODEL ?? "gemini-3-flash-preview",

  /** Picked by NODE_ENV rather than a single MONGODB_URI, so a local `npm run
   *  dev` always talks to the machine's own Mongo and can never accidentally
   *  read/write the production database. Required either way — no fallback,
   *  same reasoning as the Gemini key: connecting to an unconfigured/default
   *  DB silently would be worse than failing loudly at boot. */
  mongoUri: (nodeEnv === "production" ? process.env.MONGODB_URI_PROD : process.env.MONGODB_URI_DEV) ?? "",

  /** Signs auth session JWTs. Required for the same reason: an empty/default
   *  secret would make every issued session forgeable. */
  jwtSecret: process.env.JWT_SECRET ?? "",

  jwtExpiresIn: process.env.JWT_EXPIRES_IN ?? "7d",

  /** OAuth client ID the browser signs in with. Not a secret — it ships inside
   *  the client bundle — but every Google ID token is checked against it as the
   *  `aud` claim, so a wrong value rejects every sign-in. Must match the
   *  client's VITE_GOOGLE_CLIENT_ID exactly. */
  googleClientId: process.env.GOOGLE_CLIENT_ID ?? "",
} as const;

export const isMongoConfigured = env.mongoUri.length > 0;
export const isAuthConfigured = env.jwtSecret.length > 0;

/** Optional, unlike Mongo and JWT: email/password and guest sign-in still work
 *  without it, so the route answers 503 rather than boot failing. */
export const isGoogleConfigured = env.googleClientId.length > 0;
