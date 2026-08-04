import "./config/env.js";
import express from "express";
import cors from "cors";
import openaiChatRoutes from "./routes/openai.chat.route.js";
import geminiChatRoutes from "./routes/gemini.chat.route.js";

const app = express();

app.use(cors());
app.use(express.json());

app.get("/", (_, res) => {
  res.json({
    message: "AI Server Running 🚀",
  });
});

const PORT = Number(process.env.PORT) || 5000;

app.use("/openai/chat", openaiChatRoutes);
app.use("/gemini/chat", geminiChatRoutes);

app.listen(PORT, () => {
  console.log(`🚀 Server running on ${PORT}`);
});
