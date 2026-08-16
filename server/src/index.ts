import { env, isMongoConfigured, isAuthConfigured } from "./config/env.js";
import express from "express";
import cors from "cors";
import cookieParser from "cookie-parser";
import { connectMongo, disconnectMongo } from "./config/db.js";
import { isGeminiConfigured } from "./config/gemini.js";
import geminiChatRoutes from "./routes/gemini.chat.route.js";
import authRoutes from "./routes/auth.route.js";
import chatsRoutes from "./routes/chats.route.js";
import { errorHandler, notFound } from "./middleware/errorHandler.js";

const app = express();

// In production the app sits behind Render's proxy, so req.ip is the proxy's
// address unless we trust one hop — which would put every client in the same
// rate-limit bucket. Left off in dev, where there is no proxy to trust.
// A bare `true` is deliberately avoided: it lets anyone spoof X-Forwarded-For
// and sidestep the limiter, and express-rate-limit rejects it outright.
app.set("trust proxy", env.nodeEnv === "production" ? 1 : false);

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

app.use(notFound);
app.use(errorHandler);

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
    const server = app.listen(env.port, () => {
      console.log(`🚀 Server running on ${env.port}`);
      console.log(`   provider:  gemini (${env.geminiModel})`);
      console.log(`   mongo:     connected`);
      console.log(`   cors:      ${env.corsOrigins.join(", ")}`);
    });

    // Render sends SIGTERM on every deploy. Without this the process dies
    // mid-response and open SSE streams are severed rather than finishing.
    // The timeout is the backstop for a stream that never ends on its own.
    const SHUTDOWN_GRACE_MS = 10_000;
    let shuttingDown = false;

    const shutdown = (signal: string) => {
      if (shuttingDown) return;
      shuttingDown = true;
      console.log(`\n[shutdown] ${signal} received, draining connections…`);

      const forceExit = setTimeout(() => {
        console.error("[shutdown] grace period expired, exiting now");
        process.exit(1);
      }, SHUTDOWN_GRACE_MS);
      forceExit.unref();

      server.close(async () => {
        await disconnectMongo().catch(() => undefined);
        console.log("[shutdown] closed cleanly");
        process.exit(0);
      });
    };

    process.on("SIGTERM", () => shutdown("SIGTERM"));
    process.on("SIGINT", () => shutdown("SIGINT"));
  })
  .catch((error) => {
    console.error("[mongo] failed to connect at boot:", error);
    process.exit(1);
  });
