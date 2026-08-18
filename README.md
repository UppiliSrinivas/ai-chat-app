# AI Chat App

A ChatGPT-style chat app powered by Google Gemini. Answers stream in word by
word, chats are saved to your account, and you can start talking without
signing up.

**Live:** https://ai-chat-75ubmf09k-d-uppilisrinivasans-projects.vercel.app/

## What it does

- **Streaming replies** — text appears as the model writes it, not after.
- **No sign-up needed** — tap "Continue as guest" and start chatting. Sign in
  with Google later and your guest chats come with you.
- **Saved history** — every chat is stored per user, listed in a sidebar you
  can search through, rename, or delete.
- **Proper formatting** — markdown, tables, and syntax-highlighted code blocks
  with a copy button.
- **Works on mobile** — the sidebar becomes a drawer, everything reflows.

## Built with

| Layer    | Tech                                                        |
| -------- | ----------------------------------------------------------- |
| Frontend | React 19, Vite, TypeScript, Tailwind CSS, Zustand            |
| Backend  | Node.js, Express 5, TypeScript                               |
| Database | MongoDB (Mongoose)                                           |
| AI       | Google Gemini                                                |
| Auth     | Google Sign-In + guest accounts, JWT in an httpOnly cookie   |
| Hosting  | Vercel (frontend), Render (backend), MongoDB Atlas           |

## Running it locally

You'll need Node.js 20+, MongoDB running locally, and a Gemini API key from
[Google AI Studio](https://aistudio.google.com/app/apikey).

The frontend and backend are two separate npm projects, so install and run each
in its own terminal.

### 1. Backend

```bash
cd server
npm install
```

Create a file called `server/.env`:

```bash
GEMINI_API_KEY=your-key-here
MONGODB_URI_DEV=mongodb://127.0.0.1:27017/ai-chat-app
JWT_SECRET=any-long-random-string      # generate: openssl rand -hex 32
GOOGLE_CLIENT_ID=                      # optional, see below
```

```bash
npm run dev        # http://localhost:5000
```

The server refuses to start if any required variable is missing — it tells you
which one, so you're never debugging a broken request instead.

### 2. Frontend

```bash
cd client
npm install
```

Create `client/.env`:

```bash
VITE_GOOGLE_CLIENT_ID=   # optional; must exactly match the server's GOOGLE_CLIENT_ID
```

```bash
npm run dev        # http://localhost:5173
```

Open http://localhost:5173 and click "Continue as guest".

### Google Sign-In (optional)

Skip this and guest sign-in still works. To enable it, create an OAuth client ID
in the [Google Cloud Console](https://console.cloud.google.com/apis/credentials),
add `http://localhost:5173` as an authorised JavaScript origin, and put the same
client ID in **both** `.env` files. Without it the Google button simply doesn't
appear.

## Environment variables

### `server/.env`

| Variable            | Required        | Notes                                                        |
| ------------------- | --------------- | ------------------------------------------------------------ |
| `GEMINI_API_KEY`    | yes             | From Google AI Studio                                         |
| `MONGODB_URI_DEV`   | yes (local)     | Used when `NODE_ENV` isn't `production`                       |
| `MONGODB_URI_PROD`  | yes (prod)      | Used when `NODE_ENV=production`, so local runs can't touch it |
| `JWT_SECRET`        | yes             | Signs the login cookie — treat it like a password             |
| `GOOGLE_CLIENT_ID`  | no              | Enables Google Sign-In                                        |
| `JWT_EXPIRES_IN`    | no (`7d`)       | How long a login lasts                                        |
| `PORT`              | no (`5000`)     |                                                               |
| `CORS_ORIGIN_DEV`   | no (`:5173`)    | Which frontend URLs may call the API in dev                   |
| `CORS_ORIGIN_PROD`  | prod            | Your deployed frontend URL                                    |
| `GEMINI_MODEL`      | no              | Defaults to `gemini-3-flash-preview`                          |
| `NODE_ENV`          | no              | `production` switches to the `_PROD` variables                |

### `client/.env`

| Variable                | Required | Notes                                                     |
| ----------------------- | -------- | --------------------------------------------------------- |
| `VITE_GOOGLE_CLIENT_ID` | no       | Must match the server's `GOOGLE_CLIENT_ID`                 |
| `VITE_API_BASE_URL`     | prod     | Set to `/api` in production. See Deploying.                |

## Commands

Run these inside `server/` or `client/`.

```bash
npm run dev            # start in watch mode
npm run build          # production build
npm test               # run tests once
npm run test:watch     # re-run on change
npm run test:coverage  # coverage report
npm run typecheck      # TypeScript, no output
npm run lint           # client only (oxlint)
```

## Project structure

```
server/src/
  app.ts            Express app (routes + middleware)
  index.ts          starts the server, connects the DB
  config/           env vars, database, Gemini client
  lib/              pure logic — validation, auth, SSE, Google tokens
  middleware/       auth check, rate limits, error handling
  models/           User and Chat schemas
  routes/           /auth, /chats, /gemini/chat

client/src/
  App.tsx           routing + "are you signed in?" gate
  api/              talks to the server
  components/       composer, messages, sidebar
  hooks/            Zustand stores for chat and auth
  lib/              syntax highlighting
  pages/            chat page, sign-in page
```

## API

| Method | Endpoint          | What it does                              |
| ------ | ----------------- | ----------------------------------------- |
| GET    | `/`               | Health check                              |
| POST   | `/auth/anonymous` | Create a guest account                    |
| POST   | `/auth/google`    | Sign in with a Google token               |
| POST   | `/auth/signup`    | Email + password                          |
| POST   | `/auth/login`     | Email + password                          |
| POST   | `/auth/logout`    | Clear the session                         |
| GET    | `/auth/me`        | Who am I?                                 |
| GET    | `/chats`          | List my chats                             |
| POST   | `/chats`          | Start a new chat                          |
| GET    | `/chats/:id`      | One chat with its messages                |
| PATCH  | `/chats/:id`      | Rename                                    |
| DELETE | `/chats/:id`      | Delete                                    |
| POST   | `/gemini/chat`    | Send a message, stream the reply           |

Send `{ chatId, message }` to `/gemini/chat` — the server already knows the
conversation history, so you never send it. The reply comes back as
Server-Sent Events rather than JSON.

## How a few things work

**Guest accounts.** Clicking "Continue as guest" creates a real database user
with no email attached. When that guest later signs in with Google, the server
adds the Google identity to the *same* user record instead of making a new one,
so every chat they already had carries over.

**Login sessions.** The login token lives in an httpOnly cookie, which
JavaScript can't read. That means a cross-site scripting bug can't steal
someone's session the way it could if the token sat in `localStorage`.

**Chat history.** The server owns it. The browser sends only the newest message,
and long conversations get trimmed from the oldest end rather than rejected, so
a chat never stops working just because it got long.

## Deploying

The frontend is built for Vercel, the backend for Render.

One thing matters more than the rest: **set `VITE_API_BASE_URL` to `/api`** in
Vercel. `client/vercel.json` forwards `/api/*` to the Render backend so the API
looks like it lives on the same domain as the site. Point the frontend straight
at the Render URL instead and login breaks in a confusing way — signing in
appears to work, then every request comes back "not logged in", because browsers
won't send the session cookie across different domains.

On Render, set `NODE_ENV=production` (this switches to `MONGODB_URI_PROD` and
`CORS_ORIGIN_PROD`, and marks the cookie secure) and put your Vercel URL in
`CORS_ORIGIN_PROD`.

## Tests

```bash
cd server && npm test
cd client && npm test
```

Test files sit right next to the code they test. Coverage is enforced at 80%, so
a build fails if it drops below that.

## Branches

`main` is stable. `dev` is where work lands first, then goes to `main` via a
pull request.

## Note

`.env` files are gitignored and should never be committed.
