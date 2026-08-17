/**
 * Tests must not depend on a developer's `server/.env` — without this,
 * anything that signs a token fails with "secretOrPrivateKey must have a
 * value" on a fresh clone or in CI.
 *
 * `??=` leaves a real value alone, and dotenv doesn't override existing
 * process.env keys, so a populated .env still wins locally.
 */
process.env.JWT_SECRET ??= "test-jwt-secret";
process.env.GOOGLE_CLIENT_ID ??= "test-client-id.apps.googleusercontent.com";
process.env.GEMINI_API_KEY ??= "test-gemini-key";
process.env.MONGODB_URI_DEV ??= "mongodb://127.0.0.1:27017/ai-chat-app-test";
