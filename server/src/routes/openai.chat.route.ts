import { Router } from "express";
import { openai } from "../config/openai.js";

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
    const stream = await openai.responses.create({
      model: "gpt-4.1",
      input: message,
      stream: true,
    });

    for await (const event of stream) {
      if (clientGone) break;

      if (
        event.type === "response.output_text.delta" &&
        "delta" in event &&
        typeof event.delta === "string"
      ) {
        res.write(`data: ${JSON.stringify({ delta: event.delta })}\n\n`);
      }
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