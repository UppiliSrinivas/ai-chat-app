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
npx vitest run src/lib/chat-request/chat-request.test.ts   # a single file
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
| `JWT_EXPIRES_IN`    | `7d`                     | Keep in sync with `sessionCookieOptions.maxAge` in `lib/auth/auth.ts` |
| `GOOGLE_CLIENT_ID`  | —                        | Optional: without it `POST /auth/google` answers 503 and the other sign-in methods still work. Not a secret (it ships in the client bundle) but it is the `aud` every ID token is checked against, so it must equal the client's `VITE_GOOGLE_CLIENT_ID` exactly. |
| `PORT`              | `5000`                   |                                            |
| `CORS_ORIGIN_DEV`   | `http://localhost:5173`  | Comma-separated list. Used when `NODE_ENV` is not `production`. |
| `CORS_ORIGIN_PROD`  | `http://localhost:5173`  | Comma-separated list. Used when `NODE_ENV=production` — the deployed frontend origin(s), e.g. the Vercel URL. |
| `GEMINI_MODEL`      | `gemini-3-flash-preview` |                                            |
| `NODE_ENV`          | `development`            | Sets the session cookie's `secure` flag, and picks the `_DEV`/`_PROD` suffix for `MONGODB_URI` and `CORS_ORIGIN` |

CORS is pinned to an explicit allowlist — never widen to `"*"`, the server holds the API key and issues the session cookie. `credentials: true` lets that cookie travel cross-port to the dev client; safe only because the allowlist isn't a wildcard.

**In production the client must reach the API same-origin.** The session cookie is `sameSite=lax`, so a browser won't attach it to genuinely cross-site requests — pointing the deployed client straight at the Render URL breaks auth in a way that looks like a backend bug (sign-in succeeds, every later call 401s). `client/vercel.json` rewrites `/api/*` to Render for exactly this reason, and the client's `VITE_API_BASE_URL` must be `/api`. Don't remove the rewrite.

## Coding standards

Seven habits, both packages. Each one buys the same thing: the *next* change is easier, and the fifty after it. None of them are about writing clever code — mostly they're about writing less of it.

1. **Keep the main path easy to follow.** Guard-clause the exceptional cases at the top and return early, so the body of a function reads as the normal case. No nested ternaries and no ternary inside a template literal — name the derived value above the JSX and use it.

2. **Name things by meaning.** `looseChats`, not `filtered`; `streamedReply`, not `data`. The name says what the thing holds or does; booleans read as predicates (`isStreaming`, `hasError`). A name that needs the line below it to be understood is the wrong name.

3. **Keep external systems behind a boundary.** Gemini's wire shape stops at `lib/history/`, Mongo's at `models/`, the server's at `client/src/api/`. A provider's field names never travel past the module that speaks to it — that boundary is exactly why adding a provider is a new module instead of a rewrite.

4. **Make invalid states harder to represent.** Prefer a discriminated union over a bag of optional fields — `PendingDelete` is `{ kind: 'chat' } | { kind: 'project' }` so a chat delete can't carry a `chatCount`. If a call site is passing `undefined`, `null`, or a no-op to satisfy a type, the type is describing a state that shouldn't exist.

5. **Separate decisions from actions.** Work out *what* should happen apart from *doing* it: `lib/chat-request/` validates and windows history as a pure function, then the route streams. A decision reached inside a click handler or next to a database write can only be tested by triggering the side effect.

6. **Make errors useful.** An error carries a `code` a machine can branch on next to a `message` a human can read — `CHAT_FULL` and `PROJECT_FULL` exist so the client can tell a size cap apart from the duplicate-key 409. **Known gap:** `client/src/api/client.ts` currently keeps only `message` and drops `code`, so the client can't actually make that distinction yet. Fix it when you next touch that file rather than adding a second string-matching workaround.

7. **Keep changes focused.** One reason for a pull request, small enough that a reviewer can hold it in their head. Unrelated cleanup you spot along the way is a separate commit — bundling it is how a one-line fix turns into an afternoon of review.

## Architecture

Express 5 + TypeScript, ESM with `module: NodeNext`: relative imports carry a `.js` extension even though the sources are `.ts` (`import { env } from "./config/env.js"`).

**Code comments: 1–3 lines, plain language, non-obvious only — same rule as `client/CLAUDE.md`, applies here too.**

Each `lib/` module lives in its own folder alongside its test — `lib/sse/sse.ts` + `lib/sse/sse.test.ts`. Imports carry the full path (`../lib/sse/sse.js`); there is no barrel/`index.ts`, since `module: NodeNext` has no directory-index resolution and identical `index.ts` names make stack traces unreadable.

A chat request flows through four stages, each in one place:

1. **`routes/*.chat.route.ts`** — provider guard (503 if unconfigured), then delegates.
2. **`lib/chat-request/chat-request.ts`** — pure, provider-agnostic validation, run before `flushHeaders()` (the last point a real HTTP status can still be returned). Windows history to 80 turns / 120k chars, trimming oldest turns rather than rejecting.
3. **`lib/history/history.ts`** — maps the request to Gemini `Content[]`; appends the current message here since the wire format's history is prior-turns-only. Gemini calls assistant turns `"model"`.
4. **`lib/sse/sse.ts`** — the single implementation of the streaming contract. Routes supply nothing but an async generator of text deltas.

### The SSE contract (`lib/sse/sse.ts`)

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
- Auth is a JWT in an httpOnly, sameSite=lax cookie (`lib/auth/auth.ts`) — not a header token, so it's unreachable from JS even under XSS.
- `middleware/requireAuth.ts` verifies the cookie and sets `req.userId`. Every query filters by `userId` directly rather than fetch-then-check, so another user's chat 404s instead of 403s — no ownership-enumeration signal.
- `Chat` embeds its `messages` array instead of using a separate collection — the 80-turn/120k-char window keeps documents well under Mongo's 16MB cap, and embedding avoids a join. Revisit only if cross-chat search or per-message analytics become a real need.
- `POST /gemini/chat` now requires auth and a `chatId` (`{ chatId, message }`, not `{ message, history }`) — history loads from Mongo server-side. Chat creation is a separate `POST /chats` REST call, kept out of the SSE contract on purpose.
- `POST /auth/google` takes the ID token from `@react-oauth/google` and verifies it via `lib/google-auth/` — never decode it, an unverified decode accepts any forged payload. Identity is keyed on Google's `sub` (`User.googleId`), not the email, since an account's address can change. A verified email matching an existing password account links the two rather than colliding with the unique email index.
- `Project` is an optional grouping: `Chat.projectId` is nullable, so a chat with no project is standalone and no migration was needed. `DELETE /projects/:id` deletes the project and its own chats — both queries scoped by `userId`, so another project's chats are never touched.

### Hardening

- **Rate limits** (`middleware/rateLimit.ts`) — sign-in routes are capped per IP, `/gemini/chat` per `userId` so one NAT doesn't share a budget. Both endpoints cost real money or storage and neither is protected by CORS, which only constrains browsers.
- **`trust proxy` is `1` in production, `false` otherwise.** Render terminates TLS at a proxy, so without it every client shares the proxy's IP and the limiter is useless. Never set it to `true` — that trusts a spoofable `X-Forwarded-For`, and express-rate-limit rejects it.
- **`middleware/errorHandler.ts` is the last `app.use`.** Express 5 forwards async rejections there; without it they hit Express's default handler, which returns the stack trace whenever `NODE_ENV` isn't production. It also maps Mongo's duplicate-key (11000) to a 409, and re-throws once headers are sent so a half-written SSE stream still dies cleanly.
- **`SIGTERM`/`SIGINT` drain in-flight requests** before exit, with a 10s backstop. Render sends `SIGTERM` on every deploy, and an open SSE stream would otherwise be severed mid-response.
- **Size caps live in `lib/limits/`** — 50 messages per chat, 10 chats per project, enforced in the routes and returned to the client as `messageCount`/`chatCount`. Both reject with 409 and a `code` (`CHAT_FULL`, `PROJECT_FULL`) so the client can tell them apart from the duplicate-key 409 the error handler produces. The chat cap is checked before `flushHeaders()`, since an open SSE stream can no longer carry a status.

## Current state

- **`highlight.js` is a curated build** (`client/src/lib/highlight.ts`) — `lib/core` plus ~25 registered languages, not the default entrypoint, which bundles all 384. Add a language there rather than switching the import back.
- **Tests are colocated with the code they cover** — on the server each `lib/` module owns a folder holding both files (`lib/sse/sse.ts` + `lib/sse/sse.test.ts`); the client keeps them side by side in the component's own folder. Neither uses a mirrored `tests/` tree, so moving or deleting a module takes its test along. Both packages run vitest (`npm test`); `tsconfig.json` excludes `*.test.ts` from the server build.
  - Server: every `lib/` module is covered. `sse/sse.test.ts` drives `streamSSE` through a fake `Response` — it pins the disconnect-on-`res`-not-`req` behavior and the keepalive interval, both easy to regress.
  - Client: `hooks/`, `api/`, every component, `App.tsx`, and both pages. See `client/CLAUDE.md` for the Testing Library conventions.
  - Middleware and models are covered too — Mongoose validates a document without a connection, and the middleware take plain fake `req`/`res` objects, so neither needs a live database.
  - **Untested:** the four route files (`auth.route.ts`, `chats.route.ts`, `gemini.chat.route.ts`, `projects.route.ts`). Driving them needs `supertest` to dispatch through Express, which isn't installed — they're excluded from the coverage denominator for that reason, so the server's ~97% figure isn't whole-server coverage.
- **Coverage thresholds are enforced, not advisory** — 80% across statements/branches/functions/lines fails `npm run test:coverage` in both packages. `index.ts`, `app.ts`, `config/db.ts`, and `src/routes/**` are excluded on the server as boot wiring / untestable integration surface; the client excludes `main.tsx`.
- **`app.ts` holds the Express app, `index.ts` only boots it** — the split exists so routes can be tested without binding a port, and it's also what a serverless host would need.
- **No Vite proxy** — client calls the server's absolute origin, hence `5173` as the default CORS origin.

## Branches

`main` is stable; `dev` is the integration branch. Feature work merges into `dev`, then into `main` via PR.
