# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

Two independent npm packages — there is no workspace root. Install and run each from its own directory.

### server/

```bash
npm run dev        # tsx watch src/index.ts
npm run build      # tsc -> dist/
npm start          # node dist/index.js (requires build first)
npm run typecheck  # tsc --noEmit
npm test           # vitest run
npm run test:watch # vitest
npx vitest run src/lib/chat-request.test.ts   # a single file
npx vitest run -t "trims oldest turns"        # a single test by name
```

`config/env.ts` loads `.env` from `process.cwd()` — start the server from `server/`. Boot fails fast if `GEMINI_API_KEY`, the `NODE_ENV`-selected Mongo URI (`MONGODB_URI_DEV`/`MONGODB_URI_PROD`), or `JWT_SECRET` is unset, rather than failing on the first request.

### client/

```bash
npm run dev      # vite, port 5173
npm run build
npm run lint     # oxlint
npm run preview
```

## Environment

`server/.env` (gitignored; the tracked `.env.example` was deleted, so this is the only source of truth):

| Var                 | Default                  | Notes                                    |
| ------------------- | ------------------------ | ----------------------------------------- |
| `GEMINI_API_KEY`    | —                        | Required; boot fails without it           |
| `MONGODB_URI_DEV`   | —                        | Required when `NODE_ENV` is not `production`; boot fails without it. Points at the local `mongod`, keeping dev traffic off the production database. |
| `MONGODB_URI_PROD`  | —                        | Required when `NODE_ENV=production`; boot fails without it. 5s connect timeout, not the default 30s. |
| `JWT_SECRET`        | —                        | Required; boot fails without it. Signs session cookies — treat like an API key. |
| `JWT_EXPIRES_IN`    | `7d`                     | Keep in sync with `sessionCookieOptions.maxAge` in `lib/auth.ts` |
| `PORT`              | `5000`                   |                                            |
| `CORS_ORIGIN_DEV`   | `http://localhost:5173`  | Comma-separated list. Used when `NODE_ENV` is not `production`. |
| `CORS_ORIGIN_PROD`  | `http://localhost:5173`  | Comma-separated list. Used when `NODE_ENV=production` — the deployed frontend origin(s), e.g. the Vercel URL. |
| `GEMINI_MODEL`      | `gemini-3-flash-preview` |                                            |
| `NODE_ENV`          | `development`            | Sets the session cookie's `secure` flag, and picks the `_DEV`/`_PROD` suffix for `MONGODB_URI` and `CORS_ORIGIN` |

CORS is pinned to an explicit allowlist — never widen to `"*"`, the server holds the API key and issues the session cookie. `credentials: true` lets that cookie travel cross-port to the dev client; safe only because the allowlist isn't a wildcard.

## Architecture

Express 5 + TypeScript, ESM with `module: NodeNext`: relative imports carry a `.js` extension even though the sources are `.ts` (`import { env } from "./config/env.js"`).

**Code comments: 1–3 lines, plain language, non-obvious only — same rule as `client/CLAUDE.md`, applies here too.**

A chat request flows through four stages, each in one place:

1. **`routes/*.chat.route.ts`** — provider guard (503 if unconfigured), then delegates.
2. **`lib/chat-request.ts`** — pure, provider-agnostic validation, run before `flushHeaders()` (the last point a real HTTP status can still be returned). Windows history to 80 turns / 120k chars, trimming oldest turns rather than rejecting.
3. **`lib/history.ts`** — maps the request to Gemini `Content[]`; appends the current message here since the wire format's history is prior-turns-only. Gemini calls assistant turns `"model"`.
4. **`lib/sse.ts`** — the single implementation of the streaming contract. Routes supply nothing but an async generator of text deltas.

### The SSE contract (`lib/sse.ts`)

```
data: {"delta": "..."}      incremental text
data: [DONE]                normal end of stream
event: error\ndata: {...}   failure
: keepalive                 comment frame, every 15s
```

Two load-bearing details, preserve them:

- Disconnects are tracked on `res`'s `"close"`, not `req`'s — `req` fires `"close"` as soon as the POST body is read, which would end every stream before a chunk is written.
- `X-Accel-Buffering: no` stops an nginx-style proxy from buffering the whole "stream" into one delivery.

**Adding a provider** means a config module + a route that yields deltas into `streamSSE`. Do not hand-roll SSE in a route.

A client-side parser must handle multi-line `data:` fields, CRLF delimiters, and events split across chunk boundaries; comment frames yield no event.

### Auth and persistence

- Users and chats live in MongoDB via Mongoose (`config/db.ts`, `models/User.ts`, `models/Chat.ts`).
- Auth is a JWT in an httpOnly, sameSite=lax cookie (`lib/auth.ts`) — not a header token, so it's unreachable from JS even under XSS.
- `middleware/requireAuth.ts` verifies the cookie and sets `req.userId`. Every query filters by `userId` directly rather than fetch-then-check, so another user's chat 404s instead of 403s — no ownership-enumeration signal.
- `Chat` embeds its `messages` array instead of using a separate collection — the 80-turn/120k-char window keeps documents well under Mongo's 16MB cap, and embedding avoids a join. Revisit only if cross-chat search or per-message analytics become a real need.
- `POST /gemini/chat` now requires auth and a `chatId` (`{ chatId, message }`, not `{ message, history }`) — history loads from Mongo server-side. Chat creation is a separate `POST /chats` REST call, kept out of the SSE contract on purpose.

## Current state

- **README is stale** — still documents the removed OpenAI provider and `POST /openai/chat`. Only Gemini remains, and its contract just changed (see above).
- **Client isn't updated for auth/persistence** — `useChatStore.ts` / `streamChat.ts` still send `{ message, history }` with no cookie, so they'll 400 then 401 against the current server. Needs: create/select a chat via `POST /chats`, send `{ chatId, message }`, and `fetch(..., { credentials: 'include' })`. No login/signup UI or chat list yet.
- **No tests yet**, though vitest is wired up (`tsconfig.json` excludes `*.test.ts` from the build). `chat-request.ts`, `auth-request.ts`, and `history.ts` are pure — natural first targets.
- **No Vite proxy** — client calls the server's absolute origin, hence `5173` as the default CORS origin.

## Branches

`main` is stable; `dev` is the integration branch. Feature work merges into `dev`, then into `main` via PR.
