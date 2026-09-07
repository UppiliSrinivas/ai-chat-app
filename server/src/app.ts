import express from "express";
import cors from "cors";
import cookieParser from "cookie-parser";
import { env, isMongoConfigured, isAuthConfigured } from "./config/env.js";
import { isGeminiConfigured } from "./config/gemini.js";
import geminiChatRoutes from "./routes/gemini.chat.route.js";
import authRoutes from "./routes/auth.route.js";
import chatsRoutes from "./routes/chats.route.js";
import projectsRoutes from "./routes/projects.route.js";
import { errorHandler, notFound } from "./middleware/errorHandler.js";

/**
 * The wired-up Express app with no listener attached. Split out of index.ts so
 * tests can drive the real routes through supertest without binding a port or
 * running the boot-time config guards.
 */
export const app = express();

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
app.use("/projects", projectsRoutes);
app.use("/chats", chatsRoutes);
app.use("/gemini/chat", geminiChatRoutes);

app.use(notFound);
app.use(errorHandler);

export default app;
