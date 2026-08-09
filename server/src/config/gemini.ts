import { GoogleGenAI } from "@google/genai";
// Imported for its side effect: guarantees .env is loaded before the key is read.
import "./env.js";

const apiKey = process.env.GEMINI_API_KEY ?? "";

/** Routes check this and answer 503 rather than letting the SDK fail mid-stream
 *  with a confusing auth error after the headers are already committed. */
export const isGeminiConfigured = apiKey.length > 0;

export const gemini = new GoogleGenAI({ apiKey });
