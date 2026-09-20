/** Turns a provider's failure into something a person can read. The SDK packs
 *  its whole error document into `message`, which otherwise reaches the screen. */

export type ModelFailureCode =
  | "MODEL_BUSY"
  | "RATE_LIMITED"
  | "MODEL_REJECTED"
  | "PROVIDER_AUTH"
  | "MODEL_FAILED";

export type ModelFailure = { code: ModelFailureCode; message: string };

const FAILURES: Record<ModelFailureCode, string> = {
  MODEL_BUSY: "The model is busy right now. Try again in a moment.",
  RATE_LIMITED: "This app has reached its request limit for now. Try again later.",
  MODEL_REJECTED: "The model could not handle that request.",
  PROVIDER_AUTH: "The server's AI credentials were rejected.",
  MODEL_FAILED: "The reply could not be generated.",
};

/** The SDK reports HTTP status on the thrown error rather than by type. */
const statusOf = (error: unknown): number | undefined => {
  if (typeof error !== "object" || error === null) return undefined;

  const { status } = error as { status?: unknown };
  return typeof status === "number" ? status : undefined;
};

const codeFor = (status: number | undefined): ModelFailureCode => {
  if (status === 429) return "RATE_LIMITED";
  if (status === 401 || status === 403) return "PROVIDER_AUTH";
  if (status === 400 || status === 404 || status === 422) return "MODEL_REJECTED";
  if (status !== undefined && status >= 500) return "MODEL_BUSY";
  return "MODEL_FAILED";
};

export const describeModelFailure = (error: unknown): ModelFailure => {
  const code = codeFor(statusOf(error));
  return { code, message: FAILURES[code] };
};

/** Carries the code so the stream can report it alongside the sentence, while
 *  the original error stays in the log for whoever has to diagnose it. */
export class ModelError extends Error {
  readonly code: ModelFailureCode;

  constructor({ code, message }: ModelFailure) {
    super(message);
    this.name = "ModelError";
    this.code = code;
  }
}

export const toModelError = (error: unknown): ModelError => new ModelError(describeModelFailure(error));
