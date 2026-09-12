import { EventEmitter } from "node:events";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { Response } from "express";
import { streamSSE, type EventProducer, type StreamEvent } from "./sse.js";

/** A minimal stand-in for Express's Response: just enough of the surface
 *  streamSSE touches (headers, write/end, and the "close" event). */
class FakeResponse extends EventEmitter {
  headers: Record<string, string> = {};
  chunks: string[] = [];
  ended = false;

  setHeader(name: string, value: string) {
    this.headers[name] = value;
  }

  flushHeaders() {}

  write(chunk: string) {
    this.chunks.push(chunk);
    return true;
  }

  end() {
    this.ended = true;
  }
}

const asResponse = (res: FakeResponse) => res as unknown as Response;

const text = (value: string): StreamEvent => ({ kind: "delta", text: value });

describe("streamSSE", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("sets the SSE headers, including the anti-buffering header for proxies", async () => {
    const res = new FakeResponse();
    const produce: EventProducer = async function* () {};

    await streamSSE(asResponse(res), produce);

    expect(res.headers["Content-Type"]).toBe("text/event-stream");
    expect(res.headers["Cache-Control"]).toBe("no-cache, no-transform");
    expect(res.headers["Connection"]).toBe("keep-alive");
    expect(res.headers["X-Accel-Buffering"]).toBe("no");
  });

  it("writes each delta as its own data frame, then [DONE], then ends the response", async () => {
    const res = new FakeResponse();
    const produce: EventProducer = async function* () {
      yield text("hel");
      yield text("lo");
    };

    await streamSSE(asResponse(res), produce);

    expect(res.chunks).toEqual([
      `data: ${JSON.stringify({ delta: "hel" })}\n\n`,
      `data: ${JSON.stringify({ delta: "lo" })}\n\n`,
      "data: [DONE]\n\n",
    ]);
    expect(res.ended).toBe(true);
  });

  it("skips empty deltas", async () => {
    const res = new FakeResponse();
    const produce: EventProducer = async function* () {
      yield text("");
      yield text("content");
    };

    await streamSSE(asResponse(res), produce);

    expect(res.chunks).toEqual([`data: ${JSON.stringify({ delta: "content" })}\n\n`, "data: [DONE]\n\n"]);
  });

  it("sends an error frame and ends the response when the producer throws", async () => {
    const res = new FakeResponse();
    const produce: EventProducer = async function* () {
      yield text("partial");
      throw new Error("model exploded");
    };

    await streamSSE(asResponse(res), produce);

    expect(res.chunks).toEqual([
      `data: ${JSON.stringify({ delta: "partial" })}\n\n`,
      `event: error\ndata: ${JSON.stringify({ message: "model exploded" })}\n\n`,
    ]);
    expect(res.ended).toBe(true);
  });

  it("aborts the producer's signal when the client disconnects", async () => {
    const res = new FakeResponse();
    let observedAborted = false;

    const produce: EventProducer = async function* (signal) {
      yield text("first");
      res.emit("close");
      await Promise.resolve();
      observedAborted = signal.aborted;
    };

    await streamSSE(asResponse(res), produce);

    expect(observedAborted).toBe(true);
  });

  it("stops writing further deltas and never calls end() once the client has disconnected", async () => {
    const res = new FakeResponse();

    const produce: EventProducer = async function* () {
      yield text("first");
      res.emit("close");
      yield text("second");
    };

    await streamSSE(asResponse(res), produce);

    // No [DONE] frame and no "second" delta: the disconnect was noticed
    // before either would have been written.
    expect(res.chunks).toEqual([`data: ${JSON.stringify({ delta: "first" })}\n\n`]);
    expect(res.ended).toBe(false);
  });

  it("writes a keepalive comment frame on the heartbeat interval while the model is still thinking", async () => {
    vi.useFakeTimers();
    const res = new FakeResponse();

    let resolveProducer: () => void = () => {};
    const producerGate = new Promise<void>((resolve) => {
      resolveProducer = resolve;
    });

    const produce: EventProducer = async function* () {
      await producerGate;
    };

    const streamPromise = streamSSE(asResponse(res), produce);

    await vi.advanceTimersByTimeAsync(15_000);
    expect(res.chunks).toContain(": keepalive\n\n");

    resolveProducer();
    await streamPromise;
  });
});

describe("streamSSE tool frames", () => {
  const activity = {
    id: "call_1",
    name: "getWeather",
    status: "running" as const,
    label: "Checking the weather in Chennai",
  };

  it("writes a tool frame alongside the deltas", async () => {
    const res = new FakeResponse();
    const produce: EventProducer = async function* () {
      yield { kind: "tool", activity };
      yield text("It is warm.");
    };

    await streamSSE(asResponse(res), produce);

    expect(res.chunks).toEqual([
      `data: ${JSON.stringify({ tool: activity })}\n\n`,
      `data: ${JSON.stringify({ delta: "It is warm." })}\n\n`,
      "data: [DONE]\n\n",
    ]);
  });

  // An empty delta is skipped, but a tool frame carries no text to be empty.
  it("never skips a tool frame the way it skips an empty delta", async () => {
    const res = new FakeResponse();
    const produce: EventProducer = async function* () {
      yield text("");
      yield { kind: "tool", activity: { ...activity, status: "done", label: "" } };
    };

    await streamSSE(asResponse(res), produce);

    expect(res.chunks).toHaveLength(2);
    expect(res.chunks[0]).toContain('"tool"');
  });
});
