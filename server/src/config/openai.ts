import OpenAI from "openai";

const apiKey = process.env.OPENAI_API_KEY;

if (!apiKey) {
  console.warn(
    "OPENAI_API_KEY is not set. Check your .env file and dotenv configuration.",
  );
}

export const openai = new OpenAI({
  apiKey: apiKey ?? "",
});
