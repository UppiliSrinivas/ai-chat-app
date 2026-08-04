# ai-chat-app

A streaming AI chat application with a React frontend and an Express backend that
proxies to Google Gemini and OpenAI.

## Layout

| Path     | Description                                          |
| -------- | ---------------------------------------------------- |
| `client` | Vite + React 19 UI, markdown rendering, code hilite   |
| `server` | Express 5 API in TypeScript, streaming chat routes    |

## Getting started

### Server

```bash
cd server
npm install
cp .env.example .env   # fill in GEMINI_API_KEY and OPENAI_API_KEY
npm run dev
```

Runs on `PORT` (default `5000`) and exposes:

- `POST /openai/chat`
- `POST /gemini/chat`

### Client

```bash
cd client
npm install
npm run dev
```

## Branches

- `main` — stable
- `dev` — integration branch; feature work merges here, then into `main` via PR

## Secrets

`.env` is gitignored and must never be committed. Only `server/.env.example`,
which holds empty placeholders, is tracked.
