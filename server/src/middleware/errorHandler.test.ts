import type { NextFunction, Request, Response } from "express";
import { afterEach, describe, expect, it, vi } from "vitest";
import { errorHandler, notFound } from "./errorHandler.js";

const fakeRes = (headersSent = false) => {
  const res = {
    headersSent,
    statusCode: 0,
    body: null as unknown,
    status(code: number) {
      res.statusCode = code;
      return res;
    },
    json(payload: unknown) {
      res.body = payload;
      return res;
    },
  };
  return res;
};

const handle = (error: unknown, headersSent = false) => {
  const res = fakeRes(headersSent);
  const next = vi.fn() as unknown as NextFunction;

  errorHandler(error, {} as Request, res as unknown as Response, next);

  return { res, next };
};

afterEach(() => {
  vi.restoreAllMocks();
});

describe("notFound", () => {
  it("answers 404 as JSON", () => {
    const res = fakeRes();

    notFound({} as Request, res as unknown as Response);

    expect(res.statusCode).toBe(404);
    expect(res.body).toEqual({ message: "Not found." });
  });
});

describe("errorHandler", () => {
  it("maps a Mongo duplicate-key error to 409", () => {
    const { res, next } = handle({ code: 11000 });

    expect(res.statusCode).toBe(409);
    expect(res.body).toEqual({ message: "That account already exists." });
    expect(next).not.toHaveBeenCalled();
  });

  // The message must never include the thrown error — Express's default
  // handler leaks the stack trace outside production, which is why this exists.
  it("answers a generic 500 without leaking the error", () => {
    vi.spyOn(console, "error").mockImplementation(() => undefined);

    const { res } = handle(new Error("connection string is mongodb://user:hunter2@host"));

    expect(res.statusCode).toBe(500);
    expect(res.body).toEqual({ message: "Something went wrong." });
    expect(JSON.stringify(res.body)).not.toContain("hunter2");
  });

  it("logs the real error for the operator", () => {
    const logged = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const error = new Error("boom");

    handle(error);

    expect(logged).toHaveBeenCalledWith("[error]", error);
  });

  // Mid-stream failures can't be answered with a status — the SSE headers are
  // already committed, so only Express's default handler can close the socket.
  it("forwards to Express once headers are sent", () => {
    const error = new Error("stream died");
    const { res, next } = handle(error, true);

    expect(next).toHaveBeenCalledExactlyOnceWith(error);
    expect(res.statusCode).toBe(0);
  });

  it("treats a non-11000 code as a plain failure", () => {
    vi.spyOn(console, "error").mockImplementation(() => undefined);

    const { res } = handle({ code: 121 });

    expect(res.statusCode).toBe(500);
  });

  it.each([[null], [undefined], ["a string"]])("survives a thrown %s", (error) => {
    vi.spyOn(console, "error").mockImplementation(() => undefined);

    const { res } = handle(error);

    expect(res.statusCode).toBe(500);
  });
});
