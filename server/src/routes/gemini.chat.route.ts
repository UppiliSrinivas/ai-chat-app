import { Router } from "express";
import { gemini } from "../config/gemini.js";
import { log } from "node:console";

const router = Router();

router.post("/", async (req, res) => {
  const { message } = req.body;

  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");
  res.flushHeaders?.();

  // Track the real client disconnect on the response. Listening on `req` is a trap:
  // since Node 16 it emits "close" as soon as the request body is fully read, which
  // for a POST is immediately, ending the stream before a single chunk is written.
  let clientGone = false;
  res.on("close", () => {
    clientGone = true;
  });

  try {
    const streamResponse = await gemini.models.generateContentStream({
      model: "gemini-3-flash-preview",
      contents: message,
    });

    for await (const chunk of streamResponse) {
      if (clientGone) break;

      const text = chunk.text ?? "";

      log("Received chunk:", text); // Log the received chunk for debugging

      if (!text) continue;

      res.write(`data: ${JSON.stringify({ delta: text })}\n\n`);
    }

    if (!clientGone) {
      res.write("data: [DONE]\n\n");
      res.end();
    }
  } catch (error) {
    console.error(error);

    if (!clientGone) {
      const reason =
        error instanceof Error ? error.message : "Something went wrong";

      res.write(`event: error\ndata: ${JSON.stringify({ message: reason })}\n\n`);
      res.end();
    }
  }
});

export default router;
