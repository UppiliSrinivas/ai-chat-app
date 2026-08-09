# ai-chat-app — Prod Readiness Review

Date: 2026-08-08 · Branch: `dev` (1 commit ahead of `origin/dev`, uncommitted WIP present)
Scope: code review, security review, bundle review, build verification. No changes were made to the codebase — this is a read-only report.

## Summary

The server package (Express 5 + TypeScript, Gemini proxy) is small, well-factored, and already documents its own tricky decisions in comments (SSE disconnect handling, CORS rationale, history windowing). It typechecks and builds cleanly. The client (React 19 + Vite + Tailwind) also typechecks, builds, and lints clean bar one warning. The main gaps before calling this "prod" are: no tests anywhere, no abuse protection on the one paid API endpoint, no server hardening (helmet, graceful shutdown), a stale README, and a bundle shipping the entire `highlight.js` language set as a single 1.3MB chunk.

## Code review

**Server** — `chat-request.ts`, `history.ts`, and `sse.ts` are pure, single-purpose modules exactly as CLAUDE.md describes, and the route (`gemini.chat.route.ts`) is a thin composition of them. Validation happens before `flushHeaders()`, so real HTTP status codes are still available at that point — correct per the documented constraint. History trimming (40 turns / 60k chars, oldest-first) is implemented as described. The SSE disconnect listener is correctly bound to `res`, not `req`, with the comment explaining why. One inconsistency worth a look: `config/gemini.ts` reads `process.env.GEMINI_API_KEY` directly instead of through `config/env.ts`'s typed `env` object — harmless today since `env.ts` is imported for its dotenv side effect first, but it means the API key isn't validated/typed alongside everything else in `env`, and a future refactor of `env.ts` could silently break `gemini.ts`.

**Client** — Also mid-refactor per CLAUDE.md, but further along than the doc suggests: `App.tsx`, `main.tsx`, the chat store (Zustand), the SSE client parser, and all message/composer components already exist and are wired up (the doc's claim that `App.jsx` is still the stock template and `chatStream.ts` "does not yet exist" is stale — both are done). The Zustand store (`useChatStore.ts`) cleanly separates edit branches (multiple edits per user turn, each with its own response) from the streaming lifecycle, and correctly guards against concurrent sends (`if (get().isStreaming) return`). One real bug: `AssistantMessage.tsx` declares `isHovered`/`setIsHovered` state and wires `onMouseEnter`/`onMouseLeave` to it, but never reads `isHovered` anywhere — the action buttons are always rendered at `opacity-100` regardless of hover state (line 61 has a dead template literal `` `flex items-center gap-1 transition-opacity opacity-100` `` that doesn't reference the variable at all). This is the same issue oxlint flagged. Either the hover-to-reveal UX was intended and got lost, or the state is vestigial and should be deleted — worth a decision either way.

The client-side SSE parser (`streamChat.ts`) correctly re-implements the same contract as the server: multi-line `data:` handling, CRLF normalization, comment-frame skipping, and buffering across chunk boundaries, matching what CLAUDE.md requires.

## Security review

- **No abuse protection on `/gemini/chat`.** There's no rate limiting, no auth, and no per-IP/per-session quota. CORS restricts which *browser origins* can call it, but it does nothing to stop a direct `curl`/script from hitting the endpoint and burning through Gemini API quota — CORS is not an access-control mechanism against non-browser clients. For a proxy that spends a paid API key, this is the top item to close before any public deployment. `express-rate-limit` plus some form of request auth (even a shared client token) would close most of the exposure.
- **No security headers.** No `helmet` or equivalent — no `Content-Security-Policy`, `X-Content-Type-Options`, `Referrer-Policy`, etc. Low urgency for a pure JSON/SSE API with no server-rendered HTML, but cheap to add.
- **No graceful shutdown.** The server doesn't listen for `SIGTERM`/`SIGINT` to drain in-flight SSE streams before exiting. In a container/orchestrated environment (rolling deploys, autoscaling), this means active streams get hard-killed rather than closed cleanly.
- **CORS and secrets handling are otherwise solid.** `corsOrigins` is an explicit allowlist (never `"*"`), the API key check causes a hard boot failure rather than a runtime surprise, and `.env` is correctly gitignored — confirmed it has never been committed in this repo's history, and a history scan for OpenAI/Gemini-shaped key literals across all commits found nothing.
- **No XSS via markdown rendering.** `react-markdown` is used without `rehype-raw`, so raw HTML in model output can't execute. The one `dangerouslySetInnerHTML` (in `MarkdownContent.tsx`'s `CodeBlock`) is fed through `highlight.js`, which HTML-escapes source text before highlighting — this is the standard, safe pattern for that library.
- **`npm audit` is clean** on both `server` and `client` (0 vulnerabilities, production and dev deps).
- **Body size is bounded** (`express.json({ limit: "256kb" })`), and message/history validation caps are enforced before any provider call — no obvious request-amplification vector on the input side.

## Bundle review

Client production build (verified outside this sandbox's FUSE-mounted workspace — see Build verification) produces a single JS chunk of **1.32 MB (430 KB gzipped)**, well past Vite's 500KB warning threshold, plus a 31.6KB CSS file. The dominant cause: `MarkdownContent.tsx` does `import hljs from 'highlight.js'`, which pulls in the *entire* library — all 384 bundled languages (`node_modules/highlight.js` is 9.3MB on disk) — instead of a curated subset. Swapping to `highlight.js/lib/core` plus `hljs.registerLanguage()` for only the languages you actually expect in code blocks (JS/TS, Python, JSON, bash, etc.) is the single highest-leverage fix here and should shrink the main chunk substantially. Beyond that, there's no route-based or component-based code splitting (`React.lazy`) — reasonable for a single-page chat app today, but worth revisiting if the app grows more views. `lucide-react` and `react-router` are large in `node_modules` but both ship ESM with per-icon/per-module exports, so tree-shaking should already be limiting what actually lands in the bundle — not flagged as a concern.

## Build verification

| Check | Result |
|---|---|
| `server` typecheck (`tsc --noEmit`) | ✅ pass |
| `server` build (`tsc`) | ✅ pass |
| `server` tests (`vitest run`) | ⚠️ no test files exist yet (matches CLAUDE.md's documented state) |
| `server` `npm audit` | ✅ 0 vulnerabilities |
| `client` typecheck (`tsc --noEmit`) | ✅ pass |
| `client` lint (`oxlint`) | ⚠️ 1 warning — unused `isHovered` state (see Code review) |
| `client` build (`vite build`) | ⚠️ failed *inside this session's mounted workspace* with `EPERM: operation not permitted, unlink ...dist/...` — this is a FUSE-mount artifact of the review sandbox, not an app bug. Confirmed by copying the client to a normal filesystem path and rebuilding there: succeeded cleanly (see Bundle review for output). Worth a real local/CI build to confirm this isn't reproducible on your machine, but nothing in the app or its config caused it. |
| `client` `npm audit` | ✅ 0 vulnerabilities |

A `.husky/pre-commit` hook already runs client lint + typecheck and server typecheck on every commit — good baseline gate, though it doesn't run the (currently nonexistent) server tests or either build.

## Recommendations, roughly by priority

1. Add rate limiting / a lightweight auth gate to `POST /gemini/chat` before any public deployment — this is the one thing standing between "fine for personal use" and "someone else spends your Gemini quota."
2. Fix or remove the dead `isHovered` state in `AssistantMessage.tsx`.
3. Switch `highlight.js` to the `lib/core` + registered-languages pattern to cut the bundle from ~1.3MB toward a fraction of that.
4. Add the first tests for `chat-request.ts` and `history.ts` — CLAUDE.md already flags these as the natural first targets, and they're pure functions with no setup cost.
5. Add `helmet` and a `SIGTERM`/`SIGINT` graceful-shutdown handler to the server for real prod deployment.
6. Update the README (still documents a removed OpenAI provider, `POST /openai/chat`, and a `server/.env.example` that no longer exists) and reconcile `config/gemini.ts` to read the API key through `config/env.ts` instead of `process.env` directly.

No files were modified as part of this review.
