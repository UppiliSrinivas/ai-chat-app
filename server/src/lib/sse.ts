import type { Response } from "express";

/**
 * The single implementation of this app's Server-Sent Events contract.
 *
 * Both chat routes stream through here so the wire format, disconnect
 * handling, cancellation and error reporting can only ever be defined once.
 * A route supplies nothing but an async generator of text deltas.
 *
 *   data: {"delta": "..."}   incremental text
 *   data: [DONE]             normal end of stream
 *   event: error\ndata: {…}  failure
 */

/** Comment frames keep intermediaries from closing an idle connection while
 *  the model is still thinking. The client's parser ignores them: a frame with
 *  no `data:` line yields no event. */
const HEARTBEAT_MS = 15_000;

export type DeltaProducer = (signal: AbortSignal) => AsyncIterable<string>;

export const streamSSE = async (res: Response, produce: DeltaProducer): Promise<void> => {
  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache, no-transform");
  res.setHeader("Connection", "keep-alive");
  // Tells nginx not to buffer the response; without it a proxy can hold every
  // chunk back and deliver the whole "stream" at once.
  res.setHeader("X-Accel-Buffering", "no");
  res.flushHeaders?.();

  const controller = new AbortController();
  let clientGone = false;

  // Track the real client disconnect on the response. Listening on `req` is a trap:
  // since Node 16 it emits "close" as soon as the request body is fully read, which
  // for a POST is immediately, ending the stream before a single chunk is written.
  res.on("close", () => {
    clientGone = true;
    controller.abort();
  });

  const heartbeat = setInterval(() => {
    if (!clientGone) {
      res.write(": keepalive\n\n");
    }
  }, HEARTBEAT_MS);

  try {
    for await (const delta of produce(controller.signal)) {
      if (clientGone) break;
      if (!delta) continue;

      res.write(`data: ${JSON.stringify({ delta })}\n\n`);
    }

    if (!clientGone) {
      res.write("data: [DONE]\n\n");
      res.end();
    }
  } catch (error) {
    // An abort we triggered ourselves is not a failure, and there is no longer
    // a socket to report it on.
    if (clientGone) return;

    console.error("[sse] stream failed:", error);

    const reason = error instanceof Error ? error.message : "Something went wrong";
    res.write(`event: error\ndata: ${JSON.stringify({ message: reason })}\n\n`);
    res.end();
  } finally {
    clearInterval(heartbeat);
  }
};
