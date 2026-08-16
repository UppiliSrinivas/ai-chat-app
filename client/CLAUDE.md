# CLAUDE.md — client

Vite + React 19 UI for the chat app. See the root `CLAUDE.md` for the server and the SSE wire contract.

## Commands

```bash
npm run dev        # vite, port 5173
npm run build
npm run lint       # oxlint (not eslint)
npm run preview
npm test           # vitest run
npm run test:watch # vitest
npx vitest run src/hooks/useChatStore.test.ts   # a single file
npx vitest run -t "sends on Enter"              # a single test by name
```

Lint config lives in `.oxlintrc.json`, with `react/rules-of-hooks` as an error.

## Tests

Vitest + Testing Library in jsdom; config lives in `vite.config.js`'s `test` block, global setup in `src/test/setup.ts` (jest-dom matchers, auto-cleanup, and a `matchMedia` stub — jsdom has none, so anything using `useMediaQuery` throws without it).

**Tests sit next to the file they cover** — `ChatSidebar.tsx` / `ChatSidebar.test.tsx` in the same folder, no mirrored `__tests__/` tree. Moving or deleting a component takes its test along.

Query by accessible role/name (`getByRole('button', { name: 'Send message' })`) rather than test IDs or class names, so tests break when the UI stops being usable, not when markup is refactored. Component tests drive the UI through `userEvent`, not by poking state; store tests call actions on `useChatStore.getState()` with the `api/` modules mocked.

`userEvent.setup()` installs its own working `navigator.clipboard` — assert copy behavior via `navigator.clipboard.readText()` rather than stubbing the global, which that setup would overwrite.

## Coding rules

**File size — 400 lines is the hard ceiling, 300 is where you start looking to split.** No lower bound: a clean 40-line component is finished, not unfinished. When a file crosses ~300 lines, extract a sub-component, hook, or `lib/` helper rather than compressing formatting to fit.

**The line limit is a proxy — readability is the real rule.** A component should read top-to-bottom in one pass. Use early returns over nested ternaries, name derived values before the JSX, one idea per nesting level, no clever one-liners that need a second read.

**React Compiler is mandatory** (`vite.config.js`, `reactCompilerPreset()`) — never ship a component it can't compile.

- No hand-written `React.memo`, `useMemo`, or `useCallback` — the compiler does it. Treated as a mistake in review.
- Keep render pure and follow the Rules of Hooks strictly. The compiler bails out silently on impure components, so a violation just quietly loses the optimization.

**Responsive by default.** Every component works from mobile up. Fluid layout (flex/grid, `%`, `rem`, `clamp()`) over fixed pixel widths; add breakpoints only where layout actually breaks. Never introduce horizontal page scroll — long content like code blocks scrolls inside its own container.

**Naming.** Names state what a thing holds or does — `streamedReply`, not `data`; `ChatMessageList`, not `List`. Components `PascalCase`, hooks `useCamelCase`, file name matches the export. Booleans read as predicates (`isStreaming`, `hasError`).

**Comments are for the non-obvious only — 1–3 lines, plain language, no jargon.** Don't narrate what the code already says; explain the *why* when it isn't visible (a protocol requirement, a workaround, a trade-off). Same rule applies in `server/`.

```js
// The SSE spec allows one event to arrive split across chunks, so hold the
// tail in a buffer until a blank line proves the event is complete.
```

**Folder structure stays clean.** `components/` for UI, `hooks/` for shared stateful logic, `lib/`/`api/` for pure helpers with no React import. Delete leftover scaffolding rather than leaving it in the tree.

**Syntax highlighting is a curated build.** `lib/highlight.ts` registers ~25 languages onto `highlight.js/lib/core`; importing the default `highlight.js` entrypoint instead pulls all 384 and roughly doubles the bundle. Add languages to that list.

**Components are reusable and presentational**, driven by props — no reaching for global state or fetching their own data. Push data loading/streaming to a hook or the top of the tree; split any component that's grown a second responsibility.

## Talking to the server

No Vite proxy — requests go to the server's absolute origin (`http://localhost:5000` by default), which is why `5173` is the server's default CORS origin. Changing the client's dev port means updating `CORS_ORIGIN` in `server/.env`.

Auth is a session cookie, not a header — every fetch needs `credentials: 'include'` (`api/client.ts` sets it once for all callers). Sign up / log in via `POST /auth/signup` or `/auth/login`.

In production `VITE_API_BASE_URL` must be `/api`, which `vercel.json` rewrites to the Render origin. A cross-site base URL silently breaks auth — `sameSite=lax` means the browser won't send the cookie at all.

`POST /gemini/chat` takes `{ chatId, message }`, **not** `{ message, history }` — create or select a chat via `POST /chats` first; the server owns history now.

Response is SSE, not JSON: multi-line `data:` fields, CRLF delimiters, events split across chunk boundaries, and `: keepalive` comment frames (no event). `data: [DONE]` ends success; an `event: error` frame ends failure — keep whatever text already streamed rather than discarding the turn.

## State of this directory

Chat UI is built: `App.tsx` (react-router), `pages/chat`, `pages/signin`, `components/composser`, `components/message/*` (markdown + syntax-highlighted code via `react-markdown` / `highlight.js`), `components/sidebar/ChatSidebar.tsx`, `hooks/useChatStore.ts` + `hooks/useAuthStore.ts` (Zustand), `api/streamChat.ts` (SSE parser). Earlier notes describing this directory as the stock Vite template are stale — ignore them.

Auth UI (Google + guest sign-in), the chat sidebar, and the `{ chatId, message }` + cookie rewiring are all done. `useChatStore`, `useAuthStore`, both `api/` modules, and every component except `MarkdownContent` have colocated tests.

All source is TypeScript; `tsconfig.json` exists.
