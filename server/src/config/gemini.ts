import { GoogleGenAI } from "@google/genai";

const apiKey = process.env.GEMINI_API_KEY;

if (!apiKey) {
  console.warn(
    "GEMINI_API_KEY is not set. Check your .env file and dotenv configuration.",
  );
}

export const gemini = new GoogleGenAI({
  apiKey: apiKey ?? "",
});
