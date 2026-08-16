# ai-chat-app

A streaming AI chat app: React frontend, Express backend proxying Google Gemini.
Chats persist per user in MongoDB, and sign-in is Google or anonymous guest.

## Layout

| Path     | Description                                        |
| -------- | -------------------------------------------------- |
| `client` | Vite + React 19 UI, markdown rendering, code hilite |
| `server` | Express 5 API in TypeScript, streaming chat route   |

Two independent npm packages — there is no workspace root. Install and run each
from its own directory.

## Getting started

### Server

```bash
cd server
npm install
npm run dev
```

Create `server/.env` first. Boot fails immediately if `GEMINI_API_KEY`, the
`NODE_ENV`-selected Mongo URI, or `JWT_SECRET` is missing:

```bash
GEMINI_API_KEY=...
MONGODB_URI_DEV=mongodb://127.0.0.1:27017/ai-chat-app
JWT_SECRET=          # openssl rand -hex 32
GOOGLE_CLIENT_ID=    # optional; without it /auth/google answers 503
```

See the table in `CLAUDE.md` for every variable and its default.

### Client

```bash
cd client
npm install
npm run dev
```

`client/.env`:

```bash
VITE_GOOGLE_CLIENT_ID=   # must match the server's GOOGLE_CLIENT_ID exactly
VITE_API_BASE_URL=       # optional in dev; defaults to http://localhost:5000
```

## Endpoints

| Method | Path              | Notes                                        |
| ------ | ----------------- | -------------------------------------------- |
| GET    | `/`               | Health plus provider/mongo/auth flags         |
| POST   | `/auth/anonymous` | Mints a guest session, no credentials         |
| POST   | `/auth/google`    | Verifies a Google ID token                    |
| POST   | `/auth/signup`    | Email + password; upgrades a guest in place   |
| POST   | `/auth/login`     |                                               |
| POST   | `/auth/logout`    |                                               |
| GET    | `/auth/me`        | Current user, or 401                          |
| GET    | `/chats`          | The signed-in user's chats                    |
| POST   | `/chats`          | Create                                        |
| GET    | `/chats/:id`      | One chat with its messages                    |
| PATCH  | `/chats/:id`      | Rename                                        |
| DELETE | `/chats/:id`      |                                               |
| POST   | `/gemini/chat`    | `{ chatId, message }` → SSE stream            |

`/gemini/chat` streams Server-Sent Events rather than returning JSON, and
history lives server-side — the client sends only the new message. The wire
format is documented in `CLAUDE.md`.

## Deploying

The client is built for Vercel and the server for Render. `client/vercel.json`
rewrites `/api/*` to the Render origin, and **`VITE_API_BASE_URL` must be set to
`/api`** in the Vercel project. Pointing the client straight at the Render URL
looks like it works but breaks auth: the session cookie is `sameSite=lax`, so a
browser will not attach it to cross-site requests. The rewrite exists to keep
the API same-origin.

On the server set `NODE_ENV=production`, which selects `MONGODB_URI_PROD` and
`CORS_ORIGIN_PROD` and marks the session cookie `secure`. `CORS_ORIGIN_PROD`
must list the deployed frontend origin.

## Tests

```bash
cd server && npm test
cd client && npm test
```

Tests sit next to the code they cover. See `CLAUDE.md` and `client/CLAUDE.md`
for conventions.

## Branches

`main` is stable; `dev` is the integration branch. Feature work merges into
`dev`, then into `main` via PR.

## Secrets

`.env` is gitignored and must never be committed.
