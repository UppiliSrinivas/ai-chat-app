import { describe, expect, it } from "vitest";
import { ModelError, describeModelFailure, toModelError } from "./model-error.js";

/** Shaped like what @google/genai throws: the whole error document in
 *  `message`, with the HTTP status alongside it. */
const apiError = (status: number) =>
  Object.assign(new Error(`{"error":{"code":${status},"message":"..."}}`), { status });

describe("describeModelFailure", () => {
  it("reads an overloaded model as temporary", () => {
    expect(describeModelFailure(apiError(503))).toEqual({
      code: "MODEL_BUSY",
      message: "The model is busy right now. Try again in a moment.",
    });
  });

  it("treats every 5xx the same way", () => {
    expect(describeModelFailure(apiError(500)).code).toBe("MODEL_BUSY");
    expect(describeModelFailure(apiError(502)).code).toBe("MODEL_BUSY");
  });

  it("separates a quota refusal from an outage", () => {
    expect(describeModelFailure(apiError(429)).code).toBe("RATE_LIMITED");
  });

  it("separates a bad key from a bad request", () => {
    expect(describeModelFailure(apiError(401)).code).toBe("PROVIDER_AUTH");
    expect(describeModelFailure(apiError(403)).code).toBe("PROVIDER_AUTH");
    expect(describeModelFailure(apiError(400)).code).toBe("MODEL_REJECTED");
  });

  // A network failure or a thrown string carries no status at all.
  it("falls back when there is no status to read", () => {
    expect(describeModelFailure(new TypeError("fetch failed")).code).toBe("MODEL_FAILED");
    expect(describeModelFailure("something odd").code).toBe("MODEL_FAILED");
    expect(describeModelFailure(null).code).toBe("MODEL_FAILED");
  });

  // The point of the module: none of the provider's JSON survives.
  it("never passes the provider's own text through", () => {
    const { message } = describeModelFailure(apiError(503));

    expect(message).not.toContain("{");
    expect(message).not.toContain("error");
  });
});

describe("toModelError", () => {
  it("carries the code so the stream can report it", () => {
    const error = toModelError(apiError(429));

    expect(error).toBeInstanceOf(ModelError);
    expect(error.code).toBe("RATE_LIMITED");
    expect(error.message).toBe("This app has reached its request limit for now. Try again later.");
  });
});
