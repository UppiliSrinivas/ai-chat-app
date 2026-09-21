# Model Picker With Automatic Fallback — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let a user pick which Gemini model answers their chat, and keep the chat working by falling through to another model when the chosen one is busy.

**Architecture:** A new `lib/models/` module owns the Gemini catalogue — it fetches `ListModels`, filters out the non-chat families, derives tool capability, and caches the result behind a factory so nothing is global. A new public `GET /models` serves that catalogue to the picker. The chat route gains an optional `model`, stores it on the chat, and wraps its existing tool loop in an attempt loop that tries the next model on a 503/429/timeout — but only before the first delta is written.

**Tech Stack:** Express 5, TypeScript ESM (`module: NodeNext`, so relative imports carry `.js`), Mongoose, Vitest, React 19 + Zustand, Tailwind 4.

**Spec:** `docs/superpowers/specs/2026-09-21-model-picker-design.md`

## Global Constraints

- **ESM imports carry `.js`** even though sources are `.ts` — `import { env } from "../config/env.js"`.
- **No barrel files.** Each `lib/` module is its own folder holding the source and its test: `lib/models/models.ts` + `lib/models/models.test.ts`.
- **Comments are 1–3 lines, non-obvious only.** Explain the *why*; never narrate what the code says.
- **Coverage gate is 80%** on statements/branches/functions/lines. `src/routes/**` is excluded from coverage — route changes are verified by the `lib/` tests underneath them.
- **Guard clauses and early returns.** No nested ternaries; no ternary inside a template literal.
- **Errors carry a `code` next to a human `message`.**
- **Client: no hand-written `useMemo`/`useCallback`/`React.memo`** — React Compiler is mandatory.
- **Client tests query by accessible role/name**, never test IDs or class names.
- **Client files: 400 lines hard ceiling**, start splitting at 300.
- Server tests run from `server/`, client tests from `client/`.

---

### Task 1: Model catalogue module

Owns Google's `ListModels` shape and never lets it escape. Pure filter first, cache second.

**Files:**
- Create: `server/src/lib/models/models.ts`
- Create: `server/src/lib/models/models.test.ts`

**Interfaces:**
- Consumes: nothing.
- Produces:
  - `type ChatModel = { id: string; name: string; contextLength: number; supportsTools: boolean }`
  - `toChatModels(raw: unknown): ChatModel[]`
  - `type FetchListModels = () => Promise<unknown>`
  - `createModelCatalogue(fetchModels: FetchListModels, now?: () => number): { load(): Promise<ChatModel[]> }`
  - `SEED_MODELS: ChatModel[]`
  - `CATALOGUE_TTL_MS: number`

- [ ] **Step 1: Write the failing test**

Create `server/src/lib/models/models.test.ts`:

```ts
import { describe, expect, it, vi } from "vitest";
import {
  CATALOGUE_TTL_MS,
  SEED_MODELS,
  createModelCatalogue,
  toChatModels,
} from "./models.js";

/** Trimmed from a real ListModels response — one entry per family that the
 *  filter has to make a decision about. */
const listModelsPayload = {
  models: [
    { name: "models/gemini-3-flash-preview", displayName: "Gemini 3 Flash Preview", inputTokenLimit: 1048576, supportedGenerationMethods: ["generateContent"] },
    { name: "models/gemini-2.5-flash", displayName: "Gemini 2.5 Flash", inputTokenLimit: 1048576, supportedGenerationMethods: ["generateContent"] },
    { name: "models/gemma-4-31b-it", displayName: "Gemma 4 31B IT", inputTokenLimit: 262144, supportedGenerationMethods: ["generateContent"] },
    { name: "models/gemini-2.5-flash-preview-tts", displayName: "Gemini 2.5 Flash Preview TTS", inputTokenLimit: 8192, supportedGenerationMethods: ["generateContent"] },
    { name: "models/gemini-3-pro-image-preview", displayName: "Nano Banana Pro", inputTokenLimit: 131072, supportedGenerationMethods: ["generateContent"] },
    { name: "models/lyria-3.5", displayName: "Lyria 3.5", inputTokenLimit: 1048576, supportedGenerationMethods: ["generateContent"] },
    { name: "models/gemini-3.5-transcribe", displayName: "Gemini 3.5 Transcribe", inputTokenLimit: 98304, supportedGenerationMethods: ["generateContent"] },
    { name: "models/gemini-robotics-er-2-preview", displayName: "Gemini Robotics-ER 2 Preview", inputTokenLimit: 131072, supportedGenerationMethods: ["generateContent"] },
    { name: "models/antigravity-preview-09-2026", displayName: "Antigravity Agent Preview", inputTokenLimit: 1048576, supportedGenerationMethods: ["generateContent"] },
    { name: "models/deep-research-preview-04-2026", displayName: "Deep Research Preview", inputTokenLimit: 131072, supportedGenerationMethods: ["generateContent"] },
    { name: "models/embedding-001", displayName: "Embedding 001", inputTokenLimit: 2048, supportedGenerationMethods: ["embedContent"] },
  ],
};

const idsOf = (models: { id: string }[]) => models.map((model) => model.id);

describe("toChatModels", () => {
  it("keeps the real chat models", () => {
    expect(idsOf(toChatModels(listModelsPayload))).toEqual([
      "gemini-3-flash-preview",
      "gemini-2.5-flash",
      "gemma-4-31b-it",
    ]);
  });

  it("drops models that cannot generate text at all", () => {
    expect(idsOf(toChatModels(listModelsPayload))).not.toContain("embedding-001");
  });

  it.each([
    ["speech", "gemini-2.5-flash-preview-tts"],
    ["image", "gemini-3-pro-image-preview"],
    ["music", "lyria-3.5"],
    ["transcription", "gemini-3.5-transcribe"],
    ["robotics", "gemini-robotics-er-2-preview"],
    ["agent", "antigravity-preview-09-2026"],
    ["deep research", "deep-research-preview-04-2026"],
  ])("drops the %s model, which also advertises generateContent", (_label, id) => {
    expect(idsOf(toChatModels(listModelsPayload))).not.toContain(id);
  });

  // The suffix list cannot know about a family we have never seen, so the
  // context floor is the second line of defence.
  it("drops an unknown family whose context is too small for chat", () => {
    const raw = { models: [{ name: "models/gemini-9-whisper", displayName: "Whisper", inputTokenLimit: 8192, supportedGenerationMethods: ["generateContent"] }] };
    expect(toChatModels(raw)).toEqual([]);
  });

  it("reports tool support for gemini and withholds it from gemma", () => {
    const models = toChatModels(listModelsPayload);
    expect(models.find((model) => model.id === "gemini-2.5-flash")?.supportsTools).toBe(true);
    expect(models.find((model) => model.id === "gemma-4-31b-it")?.supportsTools).toBe(false);
  });

  it("strips the models/ prefix and carries the display name and context", () => {
    const [first] = toChatModels(listModelsPayload);
    expect(first).toEqual({
      id: "gemini-3-flash-preview",
      name: "Gemini 3 Flash Preview",
      contextLength: 1048576,
      supportsTools: true,
    });
  });

  it.each([[null], [undefined], [{}], [{ models: "nope" }], [{ models: [null] }]])(
    "returns an empty list rather than throwing on %s",
    (raw) => {
      expect(toChatModels(raw)).toEqual([]);
    },
  );
});

describe("createModelCatalogue", () => {
  it("fetches once and serves the cache until the ttl expires", async () => {
    const fetchModels = vi.fn().mockResolvedValue(listModelsPayload);
    let clock = 1_000;
    const catalogue = createModelCatalogue(fetchModels, () => clock);

    await catalogue.load();
    clock += CATALOGUE_TTL_MS - 1;
    await catalogue.load();

    expect(fetchModels).toHaveBeenCalledTimes(1);
  });

  it("refetches once the ttl has passed", async () => {
    const fetchModels = vi.fn().mockResolvedValue(listModelsPayload);
    let clock = 1_000;
    const catalogue = createModelCatalogue(fetchModels, () => clock);

    await catalogue.load();
    clock += CATALOGUE_TTL_MS;
    await catalogue.load();

    expect(fetchModels).toHaveBeenCalledTimes(2);
  });

  // A stale catalogue is still a usable picker; an empty one is a dead end.
  it("serves the stale list when a refetch fails", async () => {
    const fetchModels = vi
      .fn()
      .mockResolvedValueOnce(listModelsPayload)
      .mockRejectedValueOnce(new Error("network down"));
    let clock = 1_000;
    const catalogue = createModelCatalogue(fetchModels, () => clock);

    const fresh = await catalogue.load();
    clock += CATALOGUE_TTL_MS;

    expect(await catalogue.load()).toEqual(fresh);
  });

  it("falls back to the seed list when the very first fetch fails", async () => {
    const catalogue = createModelCatalogue(vi.fn().mockRejectedValue(new Error("network down")));

    expect(await catalogue.load()).toEqual(SEED_MODELS);
  });

  it("falls back to the seed list when the response has no usable models", async () => {
    const catalogue = createModelCatalogue(vi.fn().mockResolvedValue({ models: [] }));

    expect(await catalogue.load()).toEqual(SEED_MODELS);
  });

  // Two requests landing on a cold cache must not both hit Google.
  it("shares one in-flight fetch between concurrent callers", async () => {
    const fetchModels = vi.fn().mockResolvedValue(listModelsPayload);
    const catalogue = createModelCatalogue(fetchModels);

    await Promise.all([catalogue.load(), catalogue.load()]);

    expect(fetchModels).toHaveBeenCalledTimes(1);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

```bash
cd server && npx vitest run src/lib/models/models.test.ts
```

Expected: FAIL — `Failed to resolve import "./models.js"`.

- [ ] **Step 3: Write the implementation**

Create `server/src/lib/models/models.ts`:

```ts
/**
 * The catalogue of Gemini models a user may pick from.
 *
 * Google's ListModels shape stops here: nothing outside this module sees a
 * `models/…` name or a `supportedGenerationMethods` array.
 */

export type ChatModel = {
  id: string;
  name: string;
  contextLength: number;
  supportsTools: boolean;
};

export type FetchListModels = () => Promise<unknown>;

/** `generateContent` also matches speech, image, music, transcription,
 *  robotics and research models, none of which belong in a chat picker. */
const NON_CHAT_PATTERNS = [
  "-tts",
  "-image",
  "nano-banana",
  "lyria",
  "transcribe",
  "robotics",
  "computer-use",
  "deep-research",
  "antigravity",
];

/** Every non-chat model above sits far below this and every chat model far
 *  above it, so it catches a new family whose name we cannot know yet. */
const MIN_CONTEXT_LENGTH = 100_000;

/** ListModels does not report function-calling support, so it is derived from
 *  the family. Gemma is an open-weights release with no tool calling. */
const TOOL_CAPABLE_PREFIX = "gemini-";

export const CATALOGUE_TTL_MS = 6 * 60 * 60 * 1000;

/** Served only when the very first fetch fails, so the picker is never empty
 *  and a new chat is never blocked on Google being reachable. */
export const SEED_MODELS: ChatModel[] = [
  { id: "gemini-3-flash-preview", name: "Gemini 3 Flash Preview", contextLength: 1_048_576, supportsTools: true },
  { id: "gemini-2.5-flash", name: "Gemini 2.5 Flash", contextLength: 1_048_576, supportsTools: true },
  { id: "gemini-2.5-flash-lite", name: "Gemini 2.5 Flash-Lite", contextLength: 1_048_576, supportsTools: true },
];

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const isChatId = (id: string): boolean =>
  !NON_CHAT_PATTERNS.some((pattern) => id.includes(pattern));

const toChatModel = (entry: unknown): ChatModel | null => {
  if (!isRecord(entry)) return null;

  const { name, displayName, inputTokenLimit, supportedGenerationMethods } = entry;

  if (typeof name !== "string") return null;
  if (!Array.isArray(supportedGenerationMethods)) return null;
  if (!supportedGenerationMethods.includes("generateContent")) return null;
  if (typeof inputTokenLimit !== "number" || inputTokenLimit < MIN_CONTEXT_LENGTH) return null;

  const id = name.replace(/^models\//, "");
  if (!isChatId(id)) return null;

  return {
    id,
    name: typeof displayName === "string" && displayName ? displayName : id,
    contextLength: inputTokenLimit,
    supportsTools: id.startsWith(TOOL_CAPABLE_PREFIX),
  };
};

export const toChatModels = (raw: unknown): ChatModel[] => {
  if (!isRecord(raw) || !Array.isArray(raw.models)) return [];

  return raw.models
    .map(toChatModel)
    .filter((model): model is ChatModel => model !== null);
};

/**
 * A factory rather than a module-level cache: a shared mutable map would leak
 * between tests and make "what does a cold start do" impossible to assert.
 */
export const createModelCatalogue = (
  fetchModels: FetchListModels,
  now: () => number = Date.now,
) => {
  let cached: { models: ChatModel[]; at: number } | null = null;
  let inFlight: Promise<ChatModel[]> | null = null;

  const refresh = async (): Promise<ChatModel[]> => {
    try {
      const models = toChatModels(await fetchModels());
      if (models.length === 0) return cached?.models ?? SEED_MODELS;

      cached = { models, at: now() };
      return models;
    } catch {
      // Stale is still a usable picker; empty is a dead end.
      return cached?.models ?? SEED_MODELS;
    }
  };

  return {
    load: async (): Promise<ChatModel[]> => {
      if (cached && now() - cached.at < CATALOGUE_TTL_MS) return cached.models;

      // Two requests arriving on a cold cache must not both hit Google.
      inFlight ??= refresh().finally(() => {
        inFlight = null;
      });

      return inFlight;
    },
  };
};
```

- [ ] **Step 4: Run the test to verify it passes**

```bash
cd server && npx vitest run src/lib/models/models.test.ts
```

Expected: PASS, all tests green.

- [ ] **Step 5: Commit**

```bash
git add server/src/lib/models/
git commit -m "feat: build a filtered catalogue of Gemini chat models"
```

---

### Task 2: Serve the catalogue over HTTP

**Files:**
- Create: `server/src/config/model-catalogue.ts`
- Create: `server/src/routes/models.route.ts`
- Modify: `server/src/app.ts`
- Modify: `server/src/middleware/rateLimit.ts`
- Modify: `server/src/middleware/rateLimit.test.ts`

**Interfaces:**
- Consumes: `createModelCatalogue`, `ChatModel` from Task 1.
- Produces:
  - `modelCatalogue` (singleton) and `resolveDefaultModel(models: ChatModel[]): string` from `config/model-catalogue.js`
  - `GET /models` → `{ models: ChatModel[]; defaultModel: string }`
  - `catalogueLimiter` from `middleware/rateLimit.js`

- [ ] **Step 1: Write the failing test for the new limiter**

Append to `server/src/middleware/rateLimit.test.ts`:

```ts
import { catalogueLimiter } from "./rateLimit.js";

describe("catalogueLimiter", () => {
  it("is mounted as middleware", () => {
    expect(typeof catalogueLimiter).toBe("function");
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

```bash
cd server && npx vitest run src/middleware/rateLimit.test.ts
```

Expected: FAIL — `catalogueLimiter` is not exported.

- [ ] **Step 3: Add the limiter**

Append to `server/src/middleware/rateLimit.ts`:

```ts
/** Public and unauthenticated, and a cold cache reaches out to Google, so it
 *  is keyed on IP rather than a user that may not exist yet. */
export const catalogueLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 60,
  standardHeaders: "draft-7",
  legacyHeaders: false,
  message: tooMany,
});
```

- [ ] **Step 4: Run it to verify it passes**

```bash
cd server && npx vitest run src/middleware/rateLimit.test.ts
```

Expected: PASS.

- [ ] **Step 5: Wire the real fetcher**

Create `server/src/config/model-catalogue.ts`:

```ts
import { createModelCatalogue, SEED_MODELS, type ChatModel } from "../lib/models/models.js";
import { env } from "./env.js";

const LIST_MODELS_URL = "https://generativelanguage.googleapis.com/v1beta/models";

/** Listing needs the same key the chat calls use; a bad key surfaces here as a
 *  failed fetch, which the catalogue already answers with the seed list. */
const fetchListModels = async (): Promise<unknown> => {
  const response = await fetch(
    `${LIST_MODELS_URL}?key=${encodeURIComponent(process.env.GEMINI_API_KEY ?? "")}&pageSize=200`,
  );

  if (!response.ok) throw new Error(`ListModels failed with status ${response.status}`);
  return response.json();
};

export const modelCatalogue = createModelCatalogue(fetchListModels);

/**
 * GEMINI_MODEL is the existing notion of "the model to use", so it stays the
 * default rather than a second setting that can drift from it. A value that is
 * no longer in the catalogue falls back to the first model that is.
 */
export const resolveDefaultModel = (models: ChatModel[]): string => {
  const configured = models.find((model) => model.id === env.geminiModel);
  if (configured) return configured.id;

  return models[0]?.id ?? SEED_MODELS[0]!.id;
};
```

- [ ] **Step 6: Add the route**

Create `server/src/routes/models.route.ts`:

```ts
import { Router } from "express";
import { modelCatalogue, resolveDefaultModel } from "../config/model-catalogue.js";
import { catalogueLimiter } from "../middleware/rateLimit.js";

const router = Router();

// Deliberately unauthenticated: it is a catalogue with nothing user-specific
// in it, and the picker renders before a guest account exists.
router.get("/", catalogueLimiter, async (_req, res) => {
  const models = await modelCatalogue.load();
  res.json({ models, defaultModel: resolveDefaultModel(models) });
});

export default router;
```

- [ ] **Step 7: Mount it**

In `server/src/app.ts`, add the import beside the other route imports:

```ts
import modelsRoutes from "./routes/models.route.js";
```

and mount it above `/gemini/chat`:

```ts
app.use("/models", modelsRoutes);
```

- [ ] **Step 8: Verify the server still builds and every test passes**

```bash
cd server && npm run typecheck && npm test
```

Expected: typecheck clean, all tests pass.

- [ ] **Step 9: Commit**

```bash
git add server/src/config/model-catalogue.ts server/src/routes/models.route.ts server/src/app.ts server/src/middleware/rateLimit.ts server/src/middleware/rateLimit.test.ts
git commit -m "feat: serve the model catalogue over GET /models"
```

---

### Task 3: Remember the model on the chat

**Files:**
- Modify: `server/src/models/Chat.ts`
- Modify: `server/src/models/Chat.test.ts`

**Interfaces:**
- Produces: `Chat.model: string | null` on the chat document.

- [ ] **Step 1: Write the failing test**

Append to `server/src/models/Chat.test.ts`:

```ts
describe("model", () => {
  // Null means "whatever the server default is", so chats written before the
  // picker existed keep working with no migration.
  it("defaults to null", () => {
    const chat = new Chat({ userId: new Types.ObjectId(), title: "New chat" });

    expect(chat.model).toBeNull();
  });

  it("stores the chosen model", () => {
    const chat = new Chat({ userId: new Types.ObjectId(), model: "gemini-2.5-flash" });

    expect(chat.validateSync()).toBeUndefined();
    expect(chat.model).toBe("gemini-2.5-flash");
  });
});
```

If `Types` is not already imported in that file, add `import { Types } from "mongoose";`.

- [ ] **Step 2: Run it to verify it fails**

```bash
cd server && npx vitest run src/models/Chat.test.ts
```

Expected: FAIL — `chat.model` is `undefined`.

- [ ] **Step 3: Add the field**

In `server/src/models/Chat.ts`, inside `chatSchema`, directly after `title`:

```ts
    // Null means "use the server default", so chats created before the picker
    // existed need no migration.
    model: { type: String, default: null },
```

- [ ] **Step 4: Run it to verify it passes**

```bash
cd server && npx vitest run src/models/Chat.test.ts
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add server/src/models/Chat.ts server/src/models/Chat.test.ts
git commit -m "feat: remember which model a chat is using"
```

---

### Task 4: Accept and validate a model on the request

**Files:**
- Modify: `server/src/lib/chat-request/chat-request.ts`
- Modify: `server/src/lib/chat-request/chat-request.test.ts`

**Interfaces:**
- Consumes: nothing from earlier tasks.
- Produces:
  - `ChatMessageRequest` gains `model: string | null`
  - `resolveModel(requested: string | null, stored: string | null | undefined, fallback: string, available: readonly string[]): { ok: true; value: string } | { ok: false; error: string }`

- [ ] **Step 1: Write the failing test**

Append to `server/src/lib/chat-request/chat-request.test.ts`:

```ts
import { resolveModel } from "./chat-request.js";

describe("validateChatMessageRequest model", () => {
  it("defaults a missing model to null", () => {
    const result = validateChatMessageRequest({ chatId: "c1", message: "hi" });

    expect(result).toEqual({ ok: true, value: { chatId: "c1", message: "hi", model: null } });
  });

  it("carries a supplied model through", () => {
    const result = validateChatMessageRequest({ chatId: "c1", message: "hi", model: "gemini-2.5-flash" });

    expect(result.ok && result.value.model).toBe("gemini-2.5-flash");
  });

  it("rejects a non-string model", () => {
    const result = validateChatMessageRequest({ chatId: "c1", message: "hi", model: 7 });

    expect(result).toEqual({ ok: false, error: "`model` must be a string." });
  });
});

describe("resolveModel", () => {
  const available = ["gemini-3-flash-preview", "gemini-2.5-flash"] as const;

  it("prefers the model on the request", () => {
    expect(resolveModel("gemini-2.5-flash", "gemini-3-flash-preview", "gemini-3-flash-preview", available))
      .toEqual({ ok: true, value: "gemini-2.5-flash" });
  });

  it("falls back to the model stored on the chat", () => {
    expect(resolveModel(null, "gemini-2.5-flash", "gemini-3-flash-preview", available))
      .toEqual({ ok: true, value: "gemini-2.5-flash" });
  });

  it("falls back to the server default when neither is set", () => {
    expect(resolveModel(null, null, "gemini-3-flash-preview", available))
      .toEqual({ ok: true, value: "gemini-3-flash-preview" });
  });

  // Silently answering with a different model than the one asked for would be
  // worse than refusing: the user chose deliberately.
  it("rejects a model that is not in the catalogue", () => {
    expect(resolveModel("gemini-9-imaginary", null, "gemini-3-flash-preview", available))
      .toEqual({ ok: false, error: "Unknown model `gemini-9-imaginary`." });
  });

  // A chat can outlive a preview model that has since been retired.
  it("ignores a stored model that has disappeared from the catalogue", () => {
    expect(resolveModel(null, "gemini-retired", "gemini-3-flash-preview", available))
      .toEqual({ ok: true, value: "gemini-3-flash-preview" });
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

```bash
cd server && npx vitest run src/lib/chat-request/chat-request.test.ts
```

Expected: FAIL — `resolveModel` is not exported and `model` is missing from the validated value.

- [ ] **Step 3: Implement both**

In `server/src/lib/chat-request/chat-request.ts`, extend the request interface:

```ts
export interface ChatMessageRequest {
  chatId: string;
  message: string;
  /** Null means "decide from the chat, then the server default". */
  model: string | null;
}
```

Inside `validateChatMessageRequest`, read `model` alongside the others and validate it before the `return`:

```ts
  const { chatId, message, model } = body;
```

```ts
  if (model !== undefined && model !== null && typeof model !== "string") {
    return { ok: false, error: "`model` must be a string." };
  }

  return { ok: true, value: { chatId, message: trimmed, model: model ?? null } };
```

Then append the resolver:

```ts
export type ModelResult =
  | { ok: true; value: string }
  | { ok: false; error: string };

/**
 * Request, then the chat's remembered model, then the server default.
 *
 * A requested model that is not in the catalogue is refused rather than
 * substituted — the user picked it deliberately. A *stored* one that has
 * vanished is silently replaced, because a retired preview must not strand a
 * chat the user can no longer send to.
 */
export const resolveModel = (
  requested: string | null,
  stored: string | null | undefined,
  fallback: string,
  available: readonly string[],
): ModelResult => {
  if (requested) {
    if (!available.includes(requested)) {
      return { ok: false, error: `Unknown model \`${requested}\`.` };
    }
    return { ok: true, value: requested };
  }

  if (stored && available.includes(stored)) return { ok: true, value: stored };

  return { ok: true, value: fallback };
};
```

- [ ] **Step 4: Run the whole server suite**

```bash
cd server && npm test
```

Expected: PASS. Existing `validateChatMessageRequest` tests that assert the exact returned object will need `model: null` added — update them.

- [ ] **Step 5: Commit**

```bash
git add server/src/lib/chat-request/
git commit -m "feat: validate and resolve the model on a chat request"
```

---

### Task 5: Report the answering model over SSE

**Files:**
- Modify: `server/src/lib/sse/sse.ts`
- Modify: `server/src/lib/sse/sse.test.ts`

**Interfaces:**
- Produces: `StreamEvent` gains `{ kind: "model"; id: string; fellBack: boolean }`, written as `data: {"model":{"id":"…","fellBack":true}}`.

- [ ] **Step 1: Write the failing test**

Append to `server/src/lib/sse/sse.test.ts`, following the existing fake-response pattern in that file:

```ts
it("writes a model frame before the deltas", async () => {
  const res = createFakeResponse();

  await streamSSE(res, async function* () {
    yield { kind: "model", id: "gemini-2.5-flash", fellBack: true };
    yield { kind: "delta", text: "hi" };
  });

  expect(res.written).toEqual([
    'data: {"model":{"id":"gemini-2.5-flash","fellBack":true}}\n\n',
    'data: {"delta":"hi"}\n\n',
    "data: [DONE]\n\n",
  ]);
});
```

- [ ] **Step 2: Run it to verify it fails**

```bash
cd server && npx vitest run src/lib/sse/sse.test.ts
```

Expected: FAIL — the `model` event is not written, and TypeScript rejects the new `kind`.

- [ ] **Step 3: Extend the event union and the writer**

In `server/src/lib/sse/sse.ts`, extend `StreamEvent`:

```ts
export type StreamEvent =
  | { kind: "delta"; text: string }
  | { kind: "tool"; activity: ToolActivity }
  | { kind: "model"; id: string; fellBack: boolean };
```

and add the branch inside the `for await` loop, above the tool branch:

```ts
      if (event.kind === "model") {
        res.write(`data: ${JSON.stringify({ model: { id: event.id, fellBack: event.fellBack } })}\n\n`);
        continue;
      }
```

- [ ] **Step 4: Run it to verify it passes**

```bash
cd server && npx vitest run src/lib/sse/sse.test.ts
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add server/src/lib/sse/
git commit -m "feat: carry the answering model on the stream"
```

---
### Task 6: Classify which model failures are worth another model

Pure decision, extracted before the route is touched so the rule is testable without a stream.

**Files:**
- Modify: `server/src/lib/model-error/model-error.ts`
- Modify: `server/src/lib/model-error/model-error.test.ts`

**Interfaces:**
- Consumes: the existing `toModelError` in that module.
- Produces: `isWorthAnotherModel(error: unknown): boolean`, and `FALLBACK_CHAIN: readonly string[]` + `buildModelAttempts(chosen: string, available: readonly string[]): string[]` from `lib/limits/limits.js`.

- [ ] **Step 1: Write the failing tests**

Append to `server/src/lib/model-error/model-error.test.ts`:

```ts
import { isWorthAnotherModel } from "./model-error.js";

describe("isWorthAnotherModel", () => {
  // 503 is Google's capacity for one model and 429 is that model's quota, so
  // a different model can still answer.
  it.each([[503], [429]])("retries on %s", (status) => {
    expect(isWorthAnotherModel(Object.assign(new Error("busy"), { status }))).toBe(true);
  });

  it("retries on a timeout", () => {
    expect(isWorthAnotherModel(Object.assign(new Error("aborted"), { code: "ETIMEDOUT" }))).toBe(true);
  });

  // Our request or our key is broken, and would break identically on every
  // model in the chain.
  it.each([[400], [401], [403], [404]])("does not retry on %s", (status) => {
    expect(isWorthAnotherModel(Object.assign(new Error("bad"), { status }))).toBe(false);
  });

  it("reads a status carried on the message, as the SDK reports it", () => {
    expect(isWorthAnotherModel(new Error('{"error":{"code":503,"status":"UNAVAILABLE"}}'))).toBe(true);
  });

  it("does not retry something with no status at all", () => {
    expect(isWorthAnotherModel(new Error("kaboom"))).toBe(false);
  });
});
```

Append to `server/src/lib/limits/limits.test.ts`:

```ts
import { FALLBACK_CHAIN, buildModelAttempts } from "./limits.js";

describe("buildModelAttempts", () => {
  const available = ["gemini-3-flash-preview", "gemini-2.5-flash", "gemini-2.5-flash-lite"] as const;

  it("puts the chosen model first and never repeats it", () => {
    expect(buildModelAttempts("gemini-2.5-flash", available)).toEqual([
      "gemini-2.5-flash",
      "gemini-3-flash-preview",
      "gemini-2.5-flash-lite",
    ]);
  });

  // A retired preview in the chain must be skipped, not attempted.
  it("drops chain entries missing from the catalogue", () => {
    expect(buildModelAttempts("gemini-2.5-flash", ["gemini-2.5-flash"])).toEqual(["gemini-2.5-flash"]);
  });

  it("caps the attempts", () => {
    expect(buildModelAttempts("gemini-3-flash-preview", available).length).toBeLessThanOrEqual(3);
  });

  it("keeps a chosen model that is not in the chain", () => {
    expect(buildModelAttempts("gemma-4-31b-it", [...available, "gemma-4-31b-it"])[0]).toBe("gemma-4-31b-it");
  });
});

describe("FALLBACK_CHAIN", () => {
  // A pro-tier fallback would quietly spend several times the quota on a day
  // that is already going badly.
  it("is flash tier only", () => {
    expect(FALLBACK_CHAIN.every((model) => model.includes("flash"))).toBe(true);
  });
});
```

- [ ] **Step 2: Run them to verify they fail**

```bash
cd server && npx vitest run src/lib/model-error/ src/lib/limits/
```

Expected: FAIL — neither symbol is exported.

- [ ] **Step 3: Implement the classifier**

Append to `server/src/lib/model-error/model-error.ts`:

```ts
/** Statuses that mean "this model, right now" rather than "this request". */
const RETRYABLE_STATUSES = [429, 503];
const RETRYABLE_CODES = ["ETIMEDOUT", "ECONNRESET", "ABORT_ERR"];

const readStatus = (error: unknown): number | null => {
  if (typeof error !== "object" || error === null) return null;

  const { status, code } = error as { status?: unknown; code?: unknown };
  if (typeof status === "number") return status;
  if (typeof code === "number") return code;

  // The SDK also puts its whole error document in `message`.
  const message = (error as { message?: unknown }).message;
  if (typeof message !== "string") return null;

  const match = message.match(/"code"\s*:\s*(\d{3})/);
  return match ? Number(match[1]) : null;
};

/**
 * Whether another model is worth trying. A 503 is Google's shared capacity for
 * one model and a 429 is that model's quota, so a different model can still
 * answer; a 4xx that is not 429 is our request or our key and would fail the
 * same way on every model in the chain.
 */
export const isWorthAnotherModel = (error: unknown): boolean => {
  const status = readStatus(error);
  if (status !== null) return RETRYABLE_STATUSES.includes(status);

  const code = (error as { code?: unknown })?.code;
  return typeof code === "string" && RETRYABLE_CODES.includes(code);
};
```

- [ ] **Step 4: Implement the chain**

Append to `server/src/lib/limits/limits.ts`:

```ts
/**
 * Tried in order after the user's own choice. Fastest and cheapest first: a
 * fallback is a degraded path and must not silently escalate to a model more
 * expensive than the one that was asked for, which is why every entry is a
 * flash tier.
 */
export const FALLBACK_CHAIN = [
  "gemini-3-flash-preview",
  "gemini-2.5-flash",
  "gemini-2.5-flash-lite",
] as const;

/** Each attempt is another model call, so this bounds both the cost and how
 *  long the client waits before hearing anything. */
export const MAX_MODEL_ATTEMPTS = 3;

/** The chosen model first, then the chain, minus anything the catalogue no
 *  longer offers — a retired preview should be skipped, not attempted. */
export const buildModelAttempts = (
  chosen: string,
  available: readonly string[],
): string[] => {
  const rest = FALLBACK_CHAIN.filter(
    (model) => model !== chosen && available.includes(model),
  );

  return [chosen, ...rest].slice(0, MAX_MODEL_ATTEMPTS);
};
```

- [ ] **Step 5: Run them to verify they pass**

```bash
cd server && npx vitest run src/lib/model-error/ src/lib/limits/
```

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add server/src/lib/model-error/ server/src/lib/limits/
git commit -m "feat: decide when another model is worth trying"
```

---

### Task 7: Try the chosen model, then fall through

The only task that touches the route. Everything it decides with was tested in Tasks 4 and 6.

**Files:**
- Modify: `server/src/routes/gemini.chat.route.ts`

**Interfaces:**
- Consumes: `resolveModel` (Task 4), `{ kind: "model" }` (Task 5), `isWorthAnotherModel` + `buildModelAttempts` (Task 6), `modelCatalogue` + `resolveDefaultModel` (Task 2), `Chat.model` (Task 3).
- Produces: nothing later tasks import.

- [ ] **Step 1: Resolve the model before the stream opens**

Add the imports:

```ts
import { modelCatalogue, resolveDefaultModel } from "../config/model-catalogue.js";
import { isWorthAnotherModel, toModelError } from "../lib/model-error/model-error.js";
import { buildModelAttempts, MAX_CHAT_TOKENS, MAX_TOOL_STEPS, isChatFull } from "../lib/limits/limits.js";
import { resolveModel, validateChatMessageRequest, windowHistory, type HistoryTurn } from "../lib/chat-request/chat-request.js";
```

After the `isChatFull` guard and before `storedMessages` is built, insert:

```ts
  // Resolved before flushHeaders, like every other precondition here: once the
  // stream opens a real HTTP status can no longer be returned.
  const catalogue = await modelCatalogue.load();
  const availableIds = catalogue.map((entry) => entry.id);

  const chosen = resolveModel(
    parsed.value.model,
    chat.model,
    resolveDefaultModel(catalogue),
    availableIds,
  );

  if (!chosen.ok) {
    res.status(400).json({ message: chosen.error, code: "UNKNOWN_MODEL" });
    return;
  }

  const modelId = chosen.value;
  const supportsTools = catalogue.find((entry) => entry.id === modelId)?.supportsTools ?? false;
```

Then persist it next to the user's message, where `chat.save()` already runs:

```ts
  chat.model = modelId;
```

- [ ] **Step 2: Extract the existing tool loop into a helper**

Above `router.post("/")`, add — this is the body that currently lives inside `streamSSE`, with the model id and tools passed in rather than closed over:

```ts
type TurnResult = {
  text: string;
  promptTokens?: number;
  replyTokens?: number;
};

type TurnParams = {
  modelId: string;
  contents: Content[];
  tools: Tool[] | undefined;
  summaryText: string;
  ownerId: string;
  abortSignal: AbortSignal;
};

/**
 * One model's complete turn, tool rounds included.
 *
 * The first chunk is pulled before anything is yielded, so a 503 surfaces
 * while the caller can still try a different model rather than half way
 * through an answer the user is already reading.
 */
async function* runModelTurn({
  modelId,
  contents,
  tools,
  summaryText,
  ownerId,
  abortSignal,
}: TurnParams): AsyncGenerator<StreamEvent, TurnResult> {
  const conversation: Content[] = [...contents];
  let text = "";
  let promptTokens: number | undefined;
  let replyTokens: number | undefined;

  for (let step = 0; step < MAX_TOOL_STEPS; step += 1) {
    const stream = await gemini.models.generateContentStream({
      model: modelId,
      contents: conversation,
      config: {
        abortSignal,
        ...(tools ? { tools } : {}),
        ...(summaryText ? { systemInstruction: toSystemInstruction(summaryText) } : {}),
      },
    });

    const calls: FunctionCall[] = [];
    const modelParts: Part[] = [];
    let roundReplyTokens: number | undefined;

    for await (const chunk of stream) {
      promptTokens = chunk.usageMetadata?.promptTokenCount ?? promptTokens;
      roundReplyTokens = chunk.usageMetadata?.candidatesTokenCount ?? roundReplyTokens;

      for (const part of chunk.candidates?.[0]?.content?.parts ?? []) {
        modelParts.push(part);
        if (part.functionCall) calls.push(part.functionCall);
        if (part.thought || !part.text) continue;

        text += part.text;
        yield { kind: "delta", text: part.text };
      }
    }

    if (roundReplyTokens !== undefined) replyTokens = (replyTokens ?? 0) + roundReplyTokens;

    if (calls.length === 0) return { text, promptTokens, replyTokens };

    // Echoed back verbatim: Gemini 3 rejects a rebuilt turn whose functionCall
    // parts have lost their thought signature.
    conversation.push({ role: "model", parts: modelParts });

    const outcomes = yield* runToolCalls(calls, { userId: ownerId, signal: abortSignal });
    conversation.push({ role: "user", parts: toFunctionResponseParts(outcomes) });
  }

  const notice = "I could not finish that — it needed more tool steps than I am allowed.";
  text += notice;
  yield { kind: "delta", text: notice };
  return { text, promptTokens, replyTokens };
}
```

- [ ] **Step 3: Replace the producer with the attempt loop**

Replace the whole `await streamSSE(res, async function* (abortSignal) { … })` call with:

```ts
  await streamSSE(res, async function* (abortSignal) {
    // Tools are dropped entirely for a model that cannot call them, rather
    // than sent and silently ignored.
    const tools = supportsTools ? toGeminiTools(toolDeclarations) : undefined;
    const attempts = buildModelAttempts(modelId, availableIds);

    for (const [index, attemptId] of attempts.entries()) {
      const turn = runModelTurn({
        modelId: attemptId,
        contents,
        tools,
        summaryText,
        ownerId,
        abortSignal,
      });

      // Iterated by hand rather than with `yield*`, because whether anything
      // has reached the client is exactly what decides if falling through is
      // still safe, and `yield*` gives no way to observe that.
      let streamed = false;

      try {
        while (true) {
          const next = await turn.next();

          if (next.done) {
            fullText = next.value.text;
            promptTokens = next.value.promptTokens;
            replyTokens = next.value.replyTokens;
            answeredBy = attemptId;
            return;
          }

          // Announced only once this model is actually producing, so an
          // attempt that fails never claims to have answered.
          if (!streamed) {
            streamed = true;
            if (index > 0) yield { kind: "model", id: attemptId, fellBack: true };
          }

          yield next.value;
        }
      } catch (error) {
        if (abortSignal.aborted) throw error;

        console.error(`chat ${chatId}: ${attemptId} failed:`, error);

        // Half an answer is already on screen, so a second model would be
        // stitched onto it rather than replacing it.
        const canFallThrough = !streamed && index < attempts.length - 1;

        if (!canFallThrough || !isWorthAnotherModel(error)) throw toModelError(error);
      }
    }
  });
```

Declare `answeredBy` alongside the existing `fullText` / `promptTokens` / `replyTokens`:

```ts
  let answeredBy = modelId;
```

- [ ] **Step 4: Persist the model that actually answered**

In the `Chat.updateOne` that appends the assistant turn, add it to the `$set`:

```ts
    {
      $push: { messages: { role: "assistant", content: fullText, tokens: assistantTokens } },
      $inc: { tokenCount: assistantTokens },
      $set: { model: answeredBy },
    },
```

- [ ] **Step 5: Verify**

```bash
cd server && npm run typecheck && npm test
```

Expected: typecheck clean, all tests pass. `Content`, `Part`, `FunctionCall` and `Tool` all need to be in the existing `@google/genai` type import at the top of the file.

- [ ] **Step 6: Commit**

```bash
git add server/src/routes/gemini.chat.route.ts
git commit -m "feat: fall through to another model when one is busy"
```

---

### Task 8: Fetch the catalogue in the client

**Files:**
- Create: `client/src/api/models.ts`
- Create: `client/src/api/models.test.ts`

**Interfaces:**
- Produces: `type ChatModel`, `type ModelCatalogue`, `listModels(): Promise<ModelCatalogue>`.

- [ ] **Step 1: Write the failing test**

Create `client/src/api/models.test.ts`, following the fetch-mocking pattern used in `client/src/api/chats.test.ts`:

```ts
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { listModels } from './models'

const catalogue = {
  models: [
    { id: 'gemini-3-flash-preview', name: 'Gemini 3 Flash Preview', contextLength: 1048576, supportsTools: true },
    { id: 'gemma-4-31b-it', name: 'Gemma 4 31B IT', contextLength: 262144, supportsTools: false },
  ],
  defaultModel: 'gemini-3-flash-preview',
}

beforeEach(() => {
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, status: 200, json: async () => catalogue }))
})

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('listModels', () => {
  it('returns the catalogue and its default', async () => {
    await expect(listModels()).resolves.toEqual(catalogue)
  })

  it('requests the models endpoint', async () => {
    await listModels()

    expect(fetch).toHaveBeenCalledWith(expect.stringContaining('/models'), expect.anything())
  })
})
```

- [ ] **Step 2: Run it to verify it fails**

```bash
cd client && npx vitest run src/api/models.test.ts
```

Expected: FAIL — cannot resolve `./models`.

- [ ] **Step 3: Write the implementation**

Create `client/src/api/models.ts`:

```ts
import { apiFetch } from './client'

export type ChatModel = {
  id: string
  name: string
  contextLength: number
  supportsTools: boolean
}

export type ModelCatalogue = {
  models: ChatModel[]
  defaultModel: string
}

export function listModels(): Promise<ModelCatalogue> {
  return apiFetch<ModelCatalogue>('/models')
}
```

- [ ] **Step 4: Run it to verify it passes**

```bash
cd client && npx vitest run src/api/models.test.ts
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add client/src/api/models.ts client/src/api/models.test.ts
git commit -m "feat: fetch the model catalogue in the client"
```

---

### Task 9: Hold the selection in the chat store

**Files:**
- Modify: `client/src/hooks/useChatStore.ts`
- Modify: `client/src/hooks/useChatStore.test.ts`
- Modify: `client/src/api/streamChat.ts`
- Modify: `client/src/api/streamChat.test.ts`

**Interfaces:**
- Consumes: `listModels`, `ChatModel` (Task 8); the `model` SSE frame (Task 5).
- Produces: `models`, `selectedModel`, `answeredBy`, `loadModels()`, `selectModel(id)` on the chat store; `streamChat` gains `model` and `onModel`.

- [ ] **Step 1: Write the failing store test**

Append to `client/src/hooks/useChatStore.test.ts`, mocking `../api/models` the way the file already mocks `../api/chats`:

```ts
describe('models', () => {
  it('loads the catalogue and adopts the server default', async () => {
    await useChatStore.getState().loadModels()

    expect(useChatStore.getState().models).toHaveLength(2)
    expect(useChatStore.getState().selectedModel).toBe('gemini-3-flash-preview')
  })

  it('keeps a selection the user already made', async () => {
    useChatStore.setState({ selectedModel: 'gemma-4-31b-it' })
    await useChatStore.getState().loadModels()

    expect(useChatStore.getState().selectedModel).toBe('gemma-4-31b-it')
  })

  it('sends the selected model with the message', async () => {
    useChatStore.setState({ selectedModel: 'gemma-4-31b-it' })
    await useChatStore.getState().sendMessage('hi')

    expect(streamChat).toHaveBeenCalledWith(expect.objectContaining({ model: 'gemma-4-31b-it' }))
  })

  // The notice is per reply, so a later turn must not still show it.
  it('clears the fallback notice when the next message starts', async () => {
    useChatStore.setState({ answeredBy: { id: 'gemini-2.5-flash', fellBack: true } })
    await useChatStore.getState().sendMessage('hi')

    expect(useChatStore.getState().answeredBy).toBeNull()
  })
})
```

- [ ] **Step 2: Write the failing parser test**

Append to `client/src/api/streamChat.test.ts`:

```ts
it('reports the model when the server fell back', async () => {
  const onModel = vi.fn()

  await streamChatWithBody(
    'data: {"model":{"id":"gemini-2.5-flash","fellBack":true}}\n\ndata: {"delta":"hi"}\n\ndata: [DONE]\n\n',
    { onModel },
  )

  expect(onModel).toHaveBeenCalledWith({ id: 'gemini-2.5-flash', fellBack: true })
})
```

Use whatever helper that file already uses to feed a body through `streamChat`; if it builds the reader inline, follow that shape instead.

- [ ] **Step 3: Run both to verify they fail**

```bash
cd client && npx vitest run src/hooks/useChatStore.test.ts src/api/streamChat.test.ts
```

Expected: FAIL — `loadModels` and `onModel` do not exist.

- [ ] **Step 4: Extend the stream parser**

In `client/src/api/streamChat.ts`, add to the types:

```ts
export type AnsweringModel = { id: string; fellBack: boolean }
```

add `onModel?: (model: AnsweringModel) => void` to `StreamHandlers`, add `model?: string` to `StreamChatParams`, include it in the POST body:

```ts
    body: JSON.stringify({ chatId, message, ...(model ? { model } : {}) }),
```

and handle the frame in `handleEvent`, above the `parsed.tool` branch:

```ts
  const parsed = JSON.parse(data) as { delta?: string; tool?: ToolActivity; model?: AnsweringModel }

  if (parsed.model) {
    handlers.onModel?.(parsed.model)
    return undefined
  }
```

Remember to thread `onModel` through the `streamChat` destructure and into the `handleEvent` handlers object.

- [ ] **Step 5: Extend the store**

In `client/src/hooks/useChatStore.ts` add to `ChatState`:

```ts
  models: ChatModel[]
  selectedModel: string | null
  /** Which model answered the reply on screen, when it was not the one asked
   *  for. Live only — a reload shows the answer without the notice. */
  answeredBy: AnsweringModel | null
  loadModels: () => Promise<void>
  selectModel: (id: string) => void
```

initial values `models: []`, `selectedModel: null`, `answeredBy: null`, and the actions:

```ts
    loadModels: async () => {
      try {
        const { models, defaultModel } = await listModels()
        // A choice the user already made outranks the server's default.
        set((state) => ({ models, selectedModel: state.selectedModel ?? defaultModel }))
      } catch {
        // The picker stays on whatever it has; the send path still works.
      }
    },

    selectModel: (id) => set({ selectedModel: id }),
```

In `runStream`, clear the notice on start and pass the selection through:

```ts
    set({ isStreaming: true, streamingTurnId: turnId, error: null, activeTools: [], answeredBy: null })
```

```ts
      await streamChat({
        chatId,
        message,
        model: get().selectedModel ?? undefined,
        signal: controller.signal,
        onModel: (model) => set({ answeredBy: model }),
```

Add `models: []`, `selectedModel: null`, `answeredBy: null` to the `reset()` payload as well, and load the catalogue from `ChatPage` alongside `loadChats`.

- [ ] **Step 6: Run the client suite**

```bash
cd client && npm test
```

Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add client/src/hooks/useChatStore.ts client/src/hooks/useChatStore.test.ts client/src/api/streamChat.ts client/src/api/streamChat.test.ts
git commit -m "feat: track the selected and answering model in the client"
```

---

### Task 10: The picker and the fallback notice

**Files:**
- Create: `client/src/components/model-picker/ModelPicker.tsx`
- Create: `client/src/components/model-picker/ModelPicker.test.tsx`
- Modify: `client/src/components/composser/index.tsx`
- Modify: `client/src/components/composser/index.test.tsx`
- Modify: `client/src/pages/chat/index.tsx`

**Interfaces:**
- Consumes: `ChatModel` (Task 8), store state (Task 9).
- Produces: `<ModelPicker models selectedId onSelect />`.

- [ ] **Step 1: Write the failing component test**

Create `client/src/components/model-picker/ModelPicker.test.tsx`:

```tsx
import { describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import ModelPicker from './ModelPicker'

const models = [
  { id: 'gemini-3-flash-preview', name: 'Gemini 3 Flash Preview', contextLength: 1048576, supportsTools: true },
  { id: 'gemma-4-31b-it', name: 'Gemma 4 31B IT', contextLength: 262144, supportsTools: false },
]

const renderPicker = (onSelect = vi.fn()) => {
  render(<ModelPicker models={models} selectedId="gemini-3-flash-preview" onSelect={onSelect} />)
  return onSelect
}

describe('ModelPicker', () => {
  it('names the current model on the trigger', () => {
    renderPicker()

    expect(screen.getByRole('button', { name: /Gemini 3 Flash Preview/ })).toBeInTheDocument()
  })

  it('lists the models once opened', async () => {
    const user = userEvent.setup()
    renderPicker()

    await user.click(screen.getByRole('button', { name: /Gemini 3 Flash Preview/ }))

    expect(screen.getByRole('option', { name: /Gemma 4 31B IT/ })).toBeInTheDocument()
  })

  it('reports the chosen model and closes', async () => {
    const user = userEvent.setup()
    const onSelect = renderPicker()

    await user.click(screen.getByRole('button', { name: /Gemini 3 Flash Preview/ }))
    await user.click(screen.getByRole('option', { name: /Gemma 4 31B IT/ }))

    expect(onSelect).toHaveBeenCalledExactlyOnceWith('gemma-4-31b-it')
    expect(screen.queryByRole('option', { name: /Gemma 4 31B IT/ })).toBeNull()
  })

  // Otherwise "search my chats" quietly stops working with no explanation.
  it('marks a model that cannot call tools', async () => {
    const user = userEvent.setup()
    renderPicker()

    await user.click(screen.getByRole('button', { name: /Gemini 3 Flash Preview/ }))

    expect(screen.getByRole('option', { name: /Gemma 4 31B IT/ })).toHaveTextContent('No tools')
  })

  it('marks the current model as selected', async () => {
    const user = userEvent.setup()
    renderPicker()

    await user.click(screen.getByRole('button', { name: /Gemini 3 Flash Preview/ }))

    expect(screen.getByRole('option', { name: /Gemini 3 Flash Preview/ })).toHaveAttribute('aria-selected', 'true')
  })

  it('closes on Escape', async () => {
    const user = userEvent.setup()
    renderPicker()

    await user.click(screen.getByRole('button', { name: /Gemini 3 Flash Preview/ }))
    await user.keyboard('{Escape}')

    expect(screen.queryByRole('listbox')).toBeNull()
  })

  it('renders nothing when the catalogue is empty', () => {
    render(<ModelPicker models={[]} selectedId={null} onSelect={vi.fn()} />)

    expect(screen.queryByRole('button')).toBeNull()
  })
})
```

- [ ] **Step 2: Run it to verify it fails**

```bash
cd client && npx vitest run src/components/model-picker/ModelPicker.test.tsx
```

Expected: FAIL — cannot resolve `./ModelPicker`.

- [ ] **Step 3: Write the component**

Create `client/src/components/model-picker/ModelPicker.tsx`:

```tsx
import { useEffect, useRef, useState } from 'react'
import { Check, ChevronDown } from 'lucide-react'
import type { ChatModel } from '../../api/models'

type ModelPickerProps = {
  models: ChatModel[]
  selectedId: string | null
  onSelect: (id: string) => void
  disabled?: boolean
}

export default function ModelPicker({ models, selectedId, onSelect, disabled = false }: ModelPickerProps) {
  const [isOpen, setIsOpen] = useState(false)
  const containerRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!isOpen) return

    const handleKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setIsOpen(false)
    }

    const handleClick = (event: MouseEvent) => {
      if (!containerRef.current?.contains(event.target as Node)) setIsOpen(false)
    }

    window.addEventListener('keydown', handleKey)
    window.addEventListener('mousedown', handleClick)
    return () => {
      window.removeEventListener('keydown', handleKey)
      window.removeEventListener('mousedown', handleClick)
    }
  }, [isOpen])

  // Nothing to choose between until the catalogue arrives.
  if (models.length === 0) return null

  const selected = models.find((model) => model.id === selectedId) ?? models[0]

  return (
    <div ref={containerRef} className="relative">
      <button
        type="button"
        onClick={() => setIsOpen((open) => !open)}
        disabled={disabled}
        aria-haspopup="listbox"
        aria-expanded={isOpen}
        className="flex items-center gap-1 rounded-full px-2 py-1 text-xs text-zinc-400 transition-colors hover:bg-zinc-800 hover:text-zinc-100 disabled:opacity-50"
      >
        {selected.name}
        <ChevronDown size={13} />
      </button>

      {isOpen && (
        <ul
          role="listbox"
          className="absolute bottom-full left-0 z-40 mb-2 max-h-72 w-64 overflow-y-auto rounded-2xl border border-zinc-800 bg-zinc-900 p-1 shadow-2xl shadow-black/50"
        >
          {models.map((model) => {
            const isSelected = model.id === selected.id

            return (
              <li key={model.id}>
                <button
                  type="button"
                  role="option"
                  aria-selected={isSelected}
                  onClick={() => {
                    onSelect(model.id)
                    setIsOpen(false)
                  }}
                  className="flex w-full items-center justify-between gap-2 rounded-xl px-3 py-2 text-left text-sm text-zinc-200 hover:bg-zinc-800"
                >
                  <span className="truncate">{model.name}</span>
                  {!model.supportsTools && <span className="shrink-0 text-[10px] text-zinc-500">No tools</span>}
                  {isSelected && <Check size={14} className="shrink-0 text-zinc-400" />}
                </button>
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}
```

- [ ] **Step 4: Run it to verify it passes**

```bash
cd client && npx vitest run src/components/model-picker/ModelPicker.test.tsx
```

Expected: PASS.

- [ ] **Step 5: Put it in the composer**

In `client/src/components/composser/index.tsx`, extend the props with `models`, `selectedModel`, `onSelectModel`, then replace the usage `<span>` row so the picker sits to its left:

```tsx
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <ModelPicker
              models={models}
              selectedId={selectedModel}
              onSelect={onSelectModel}
              disabled={isStreaming}
            />
            <span className="px-1 text-xs text-zinc-400/70 tabular-nums">{usageLabel}</span>
          </div>
```

Default `models = []` and `selectedModel = null` in the destructure so the existing composer tests keep passing without new props.

- [ ] **Step 6: Wire the page**

In `client/src/pages/chat/index.tsx`: read `models`, `selectedModel`, `selectModel`, `loadModels`, `answeredBy` from the store, call `loadModels()` in an effect with no `user` guard (the catalogue is public), pass the three props to both `<Composer />` call sites, and render the notice above the reply:

```tsx
  const fallbackNotice = answeredBy?.fellBack
    ? `${selectedModelName} was busy — answered by ${answeredByName}`
    : null
```

Derive `selectedModelName` and `answeredByName` from `models` above the JSX — never inline a ternary in the template.

- [ ] **Step 7: Full verification**

```bash
cd client && npm run lint && npm run typecheck && npm test
cd ../server && npm run typecheck && npm test
```

Expected: all green in both packages.

- [ ] **Step 8: Commit**

```bash
git add client/src/components/model-picker/ client/src/components/composser/ client/src/pages/chat/index.tsx
git commit -m "feat: let a user pick which model answers"
```

---

## Manual verification

With `server/.env` holding a real `GEMINI_API_KEY`:

```bash
curl -s localhost:5000/models | head -c 400
```

Expect a `models` array of Gemini chat models — no `-tts`, `-image`, `lyria`, `transcribe` or `deep-research` entries — plus a `defaultModel`.

Then in the UI: open a chat, pick a model, send a message, reload, and confirm the picker still shows the model that chat used.

To exercise the fallback without waiting for a real outage, temporarily point the first entry of `FALLBACK_CHAIN` at a model id that does not exist and confirm the reply still arrives with the "was busy" notice.

## Out of scope

- OpenRouter or any second provider
- Per-message model choice or per-reply attribution badges
- A user-configurable fallback order
- Renaming `/gemini/chat`
