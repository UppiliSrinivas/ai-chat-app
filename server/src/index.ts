import { env, isMongoConfigured, isAuthConfigured } from "./config/env.js";
import express from "express";
import cors from "cors";
import cookieParser from "cookie-parser";
import { connectMongo } from "./config/db.js";
import { isGeminiConfigured } from "./config/gemini.js";
import geminiChatRoutes from "./routes/gemini.chat.route.js";
import authRoutes from "./routes/auth.route.js";
import chatsRoutes from "./routes/chats.route.js";

const app = express();

// Pinned to known origins. This server holds the provider API key and
// session cookies, so a wide-open CORS policy hands anyone with a browser
// the ability to spend the key or ride an authenticated session.
// `credentials: true` is required for the auth cookie to travel on
// cross-port requests from the dev client — it only works because the
// allowlist above is explicit, never "*" (browsers reject credentialed
// requests against a wildcard origin anyway).
app.use(cors({ origin: env.corsOrigins, credentials: true }));
app.use(express.json({ limit: "256kb" }));
app.use(cookieParser());

app.get("/", (_, res) => {
  res.json({
    message: "AI Server Running 🚀",
    providers: {
      gemini: isGeminiConfigured,
    },
    mongo: isMongoConfigured,
    auth: isAuthConfigured,
  });
});

app.use("/auth", authRoutes);
app.use("/chats", chatsRoutes);
app.use("/gemini/chat", geminiChatRoutes);

// Booting without usable config is always a misconfiguration — fail loudly
// here rather than at the first request.
if (!isGeminiConfigured) {
  console.error("No provider API key found. Set GEMINI_API_KEY in server/.env");
  process.exit(1);
}
if (!isMongoConfigured) {
  const varName = env.nodeEnv === "production" ? "MONGODB_URI_PROD" : "MONGODB_URI_DEV";
  console.error(`${varName} is not set. Set it in server/.env`);
  process.exit(1);
}
if (!isAuthConfigured) {
  console.error("JWT_SECRET is not set. Set it in server/.env");
  process.exit(1);
}

connectMongo()
  .then(() => {
    app.listen(env.port, () => {
      console.log(`🚀 Server running on ${env.port}`);
      console.log(`   provider:  gemini (${env.geminiModel})`);
      console.log(`   mongo:     connected`);
      console.log(`   cors:      ${env.corsOrigins.join(", ")}`);
    });
  })
  .catch((error) => {
    console.error("[mongo] failed to connect at boot:", error);
    process.exit(1);
  });
