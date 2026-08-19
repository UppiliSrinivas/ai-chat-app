# AI Chat App

A ChatGPT-style chat app powered by Google Gemini. Replies stream word by word,
chats are saved per account, and you can start without signing up.

**Live:** https://ai-chat-app-seven-beryl.vercel.app

- Streaming replies, markdown and syntax-highlighted code with a copy button
- Guest accounts — sign in with Google later and your chats come with you
- Chat history in a sidebar; rename, delete, edit and resend any message
- Mobile-first, sidebar collapses to a drawer

| Layer    | Tech                                                      |
| -------- | --------------------------------------------------------- |
| Frontend | React 19, Vite, TypeScript, Tailwind, Zustand              |
| Backend  | Node 20+, Express 5, TypeScript, Mongoose                  |
| Data     | MongoDB · AI: Google Gemini                                |
| Auth     | Google Sign-In + guests, JWT in an httpOnly cookie         |
| Hosting  | Vercel · Render · MongoDB Atlas                            |

## Run it

Two separate npm projects. You need a local MongoDB and a
[Gemini API key](https://aistudio.google.com/app/apikey).

```bash
# server/.env
GEMINI_API_KEY=your-key
MONGODB_URI_DEV=mongodb://127.0.0.1:27017/ai-chat-app
JWT_SECRET=$(openssl rand -hex 32)
```

```bash
cd server && npm install && npm run dev   # :5000
cd client && npm install && npm run dev   # :5173
```

Open http://localhost:5173 and click **Continue as guest**.

Boot fails loudly and names the missing variable rather than breaking on the
first request. Full variable list is in [CLAUDE.md](CLAUDE.md).

**Google Sign-In is optional.** Create an OAuth client ID, add
`http://localhost:5173` as an authorised origin, then set the same ID as
`GOOGLE_CLIENT_ID` (server) and `VITE_GOOGLE_CLIENT_ID` (client). Without it the
Google button just doesn't render.

## Commands

Run inside `server/` or `client/`.

```bash
npm run dev · build · test · test:coverage · typecheck
npm run lint     # client only
```

Tests sit next to the code they cover. Coverage is enforced at 80%.

## API

`POST /gemini/chat` takes `{ chatId, message }` and replies with Server-Sent
Events, not JSON — the server owns the history, so you never send it. Create a
chat with `POST /chats` first.

Everything else: `/auth/{signup,login,anonymous,google,logout,me}` and
`/chats/:id` for GET, PATCH, DELETE.

## Deploying

Frontend on Vercel, backend on Render.

**Set `VITE_API_BASE_URL=/api` on Vercel.** `client/vercel.json` forwards
`/api/*` to Render so the API looks same-origin. Point the client straight at
the Render URL instead and auth breaks confusingly — sign-in appears to work,
then every request 401s, because a `sameSite=lax` cookie isn't sent across
domains.

On Render set `NODE_ENV=production` (switches to the `_PROD` variables and marks
the cookie secure) and put your Vercel URL in `CORS_ORIGIN_PROD`.

## Branches

`main` is stable, `dev` is where work lands first, merged via PR.
`.env` files are gitignored — never commit them.
