import { app } from "./app.js";
import { env, isMongoConfigured, isAuthConfigured } from "./config/env.js";
import { connectMongo, disconnectMongo } from "./config/db.js";
import { isGeminiConfigured } from "./config/gemini.js";

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
