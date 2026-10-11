# Model picker with automatic fallback — design

**Date:** 2026-09-21
**Status:** awaiting review

## Goal

Let a user explicitly choose which Gemini model answers their chat, and keep the
chat working when that model is busy by falling through to another one.

Two problems this solves:

1. A `503 UNAVAILABLE` today ends the turn with a raw error and no recovery.
2. The model is fixed at `GEMINI_MODEL`; a user cannot trade speed for quality.

## Decisions taken

| Question | Decision |
|---|---|
| When can the model be chosen? | Per chat, switchable at any time |
| Model on failure | Auto-fallback before the first delta, with a visible notice |
| Models that cannot call tools | Still offered, flagged in the picker |
| Provider | Gemini only. OpenRouter is a later adapter, not this change |

### Why Gemini rather than OpenRouter

- Gemini's `503` is **per model**, not per project, so switching models is a real
  recovery path rather than a retry in disguise.
- The key already exists and the free tier is ~1,500 requests/day against
  OpenRouter's 50.
- Nothing is deleted: `config/gemini.ts` and `lib/history/history.ts` stay, and the
  Gemini 3 tool loop keeps its thought signatures.

Adding OpenRouter later becomes one more adapter behind an interface that will
already exist, instead of a rewrite.

## Model catalogue

### Source

`GET https://generativelanguage.googleapis.com/v1beta/models?key=…` returns 58
entries, 41 of which advertise `generateContent`.

### The filtering problem

`generateContent` is not a useful filter on its own — it also matches text-to-speech,
image generation, music (Lyria), transcription, robotics, computer-use and
deep-research models. Showing those in a chat picker would be broken.

### Filter rule

A model is offered when **all** hold:

1. `supportedGenerationMethods` includes `generateContent`
2. Its id matches none of: `-tts`, `-image`, `nano-banana`, `lyria`,
   `transcribe`, `robotics`, `computer-use`, `deep-research`, `antigravity`
3. `inputTokenLimit >= 100_000` — a second line of defence, since every
   non-chat model above sits far below this and every chat model far above

Rule 2 is a denylist rather than an allowlist on purpose: a new Gemini chat model
should appear without a code change, which is the entire reason for listing
dynamically.

### Tool capability

`ListModels` does not report function-calling support, unlike OpenRouter's
`supported_parameters`. So capability is derived:

- `gemini-*` → supports tools
- `gemma-*` → does not (Gemma has no function calling)

This is the one piece of hardcoded knowledge in the module, and it is kept in a
single named constant so it is obvious when it needs revisiting.

### Neutral shape

Google's wire shape stops inside `lib/models/`, consistent with the existing rule
that a provider's field names never travel past the module that speaks to it:

```ts
type ChatModel = {
  id: string            // "gemini-3.8-flash", the models/ prefix stripped
  name: string          // displayName
  contextLength: number // inputTokenLimit
  supportsTools: boolean
}
```

### Caching

- Fetched server side, cached in memory, 6 hour TTL.
- On a fetch failure the cache is served stale rather than emptied.
- A cold start that also fails falls back to a small hardcoded seed list, so the
  picker is never empty and a new chat is never blocked on Google being reachable.

## API surface

### `GET /models` (new)

```json
{ "models": [ChatModel], "defaultModel": "gemini-3-flash-preview" }
```

- `defaultModel` is the existing `GEMINI_MODEL` env var, not a new setting — the
  server already has a notion of "the model to use" and a second one would drift.
  If its value is missing from the live catalogue, the first entry of
  `FALLBACK_CHAIN` that survives filtering is used instead.
- Public, no auth. It is a catalogue with nothing user-specific in it, and the
  picker has to render before a guest account exists.
- Rate limited, since it is public and does an upstream fetch on a cold cache.

### `POST /gemini/chat` (changed)

Body becomes `{ chatId, message, model? }`.

- `model` is optional. Resolution order: the request's model, then the chat's
  stored model, then `defaultModel`.
- An unknown or filtered-out model is a `400`, not a silent substitution — a user
  who asked for a specific model should not be answered by a different one without
  being told.
- Validated in `lib/chat-request/`, before `flushHeaders()`, like every other
  precondition on this route.

The route keeps its path for now. Renaming it to `/chat` is a client-breaking
change that belongs with the OpenRouter work, not here.

## Data model

`Chat.model: { type: String, default: null }`

- `null` means "whatever the server default is", so existing chats need no migration.
- Written on each send, which is what makes the choice per chat and sticky.

## Fallback

### Chain

`[chosen, ...FALLBACK_CHAIN.filter(m => m !== chosen)]`, capped at 3 attempts.

```ts
const FALLBACK_CHAIN = [
  "gemini-3-flash-preview",  // the current default
  "gemini-2.5-flash",        // stable, not a preview
  "gemini-2.5-flash-lite",   // last resort, smallest
]
```

Ordered fastest and cheapest first: a fallback is a degraded path and should not
silently escalate to a more expensive model than the user asked for. Every entry
is deliberately a `flash` tier — a `pro` model as a fallback would quietly spend
several times the quota on a bad day.

Entries are filtered against the live catalogue at use time, so a retired preview
id in this list is skipped rather than throwing.

### Which errors fall through

| Status | Meaning | Action |
|---|---|---|
| 503 | Google capacity | try next model |
| 429 | quota for that model | try next model |
| timeout | no response | try next model |
| 400 / 401 / 403 | our bug or our key | fail immediately, do not retry |

Falling through on a `400` would try every model in the chain against a request
that is malformed for all of them.

### The streaming constraint

A fallback is only attempted **before the first delta is written**. Once
`flushHeaders()` has run the status is committed and a second model's output
cannot be stitched onto a partial answer; a mid-stream failure ends the stream
with the existing `event: error` frame.

In practice this is workable because a 503 arrives when the stream is opened, not
part-way through.

## SSE contract

One new event, additive to the existing contract:

```
data: {"model": {"id": "gemini-2.5-flash", "fellBack": true}}
```

- Emitted once, before the first delta, and only when `fellBack` is true.
- Unknown `data:` payloads are already ignored by the client parser, so an older
  client is unaffected.

## Client

- `api/models.ts` → `listModels()`
- Model list and selection live in the chat store, alongside `chatId`
- Picker rendered in the composer, next to the token count
- A model without tool support shows a quiet hint, so a user understands why
  "search my chats" stopped working
- A fallback shows one line above the reply: "Gemini 3 Flash was busy — answered by
  Gemini 2.5 Flash"

## Testing

Pure units, no network, consistent with the existing `lib/` modules:

- `lib/models/models.test.ts` — the filter rule against a recorded `ListModels`
  payload: TTS, image, Lyria and robotics entries excluded; Gemma flagged as no
  tools; the token-limit floor; stale-cache-on-failure; seed list on cold failure
- `lib/chat-request/` — unknown model rejected, resolution order honoured
- `lib/sse/` — the model event is emitted before the first delta and only on fallback
- Client — picker renders, selection persists to the store, fallback notice appears

A recorded fixture, not a live call: the model list changes under us and a test
that fetches it is a test that fails on Google's schedule.

## Out of scope

- OpenRouter or any second provider
- Per-message model choice or per-message attribution badges
- A user-configurable fallback order
- Renaming `/gemini/chat`

## Risks

- **Hardcoded tool capability.** `gemini-*` vs `gemma-*` is a heuristic. If Google
  ships a `gemini-` model without function calling, the picker will lie. Contained
  to one constant.
- **Denylist drift.** A new non-chat model family with an unseen suffix would leak
  into the picker until the pattern list is updated. The token-limit floor catches
  the small ones; a large one would not be caught.
- **Free-tier quota is shared.** Compaction already spends model calls, and a
  fallback chain spends more on a bad day.
