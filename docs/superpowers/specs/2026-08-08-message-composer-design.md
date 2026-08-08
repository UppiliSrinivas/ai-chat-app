# Message Composer Component — Design

**Date:** 2026-08-08
**Scope:** `client/src/components/composser/index.tsx` — the chat message input bar. First real component landing in this mid-rewrite client (message component and chat page are still empty stubs and are out of scope here).

## 1. Tailwind CSS setup

The client currently has no CSS convention (only global `index.css`/`App.css`). This work introduces Tailwind CSS v4 as that convention going forward.

- Install `tailwindcss` and `@tailwindcss/vite` (v4's CSS-first setup — no `tailwind.config.js` required for standard utilities).
- Add the `tailwindcss()` plugin to `vite.config.js`, alongside the existing `react()` and `babel({ presets: [reactCompilerPreset()] })` plugins. Order: `[react(), tailwindcss(), babel(...)]` — Tailwind before the Babel/React Compiler pass so compiled output isn't affected by CSS processing order.
- Add `@import "tailwindcss";` to the top of `client/src/index.css`, ahead of the existing `:root` variables and rules — those stay as-is (Tailwind's layers coexist with plain CSS).
- Set `body` to a black base background (`background: #000` or Tailwind's `bg-black` equivalent) so the composer sits on a matching black shell. This is a minimal, targeted change — `App.jsx` and the other stub pages are a separate rebuild and are not touched here.

## 2. Component API

```ts
type ComposerProps = {
  onSend: (message: string) => void | Promise<void>
  isStreaming?: boolean
  onStop?: () => void
  disabled?: boolean
  placeholder?: string
}
```

- The composer owns its own draft-text state internally (`useState`). The parent never controls the textarea's value directly — it only receives the final trimmed message string via `onSend` once the user sends.
- `isStreaming` and `onStop` together drive the send/stop button swap (see below). Both are optional so the component works standalone before a streaming hook exists.
- `disabled` covers any other reason input should be blocked (e.g. provider not configured).

## 3. Behavior

- **Send on Enter**, **newline on Shift+Enter**. IME composition (`isComposing`) is respected — Enter during composition never sends.
- Sending is blocked when the trimmed value is empty, or when `disabled`/`isStreaming` is true.
- After a successful send, the textarea clears and its height resets to the single-line minimum.
- The textarea auto-grows with content up to a max height (200px), then scrolls internally rather than growing further.
- **Attachment button** (Paperclip icon, left side): rendered but inert — a visual placeholder for future file-attach support. No handler wired.
- **Send button** (right side): shows a send/arrow icon (`ArrowUp` from lucide-react) when idle; disabled (dimmed, non-interactive) when there's nothing to send. When `isStreaming` is true, the icon swaps to a stop icon (`Square` from lucide-react) and clicking it calls `onStop` instead of sending.

## 4. Visual design

- **Outer bar:** black background, full width of its container, padded. Not fixed/sticky — positioning is the parent's responsibility.
- **Inner composer surface:** dark gray (Tailwind `zinc-800`), `rounded-3xl` corners, a subtle `zinc-700` border. Grows taller with the textarea's content (see max-height above). Flex row layout: attachment button, textarea, send button.
- **Focus state:** a subtle ring/border highlight on the inner surface when the textarea is focused.
- **Responsive:** fluid width throughout, no fixed pixel widths. Padding and icon sizing tighten at narrow (mobile) widths via Tailwind breakpoints. No horizontal scroll introduced.

## 5. Out of scope

- Wiring to the actual `streamChat.ts` API or the chat page — those files are empty stubs being rebuilt separately.
- Attachment upload functionality — button is a placeholder only.
- Changing the app's overall light theme in `index.css` beyond the `body` background — full dark-theme rollout to other pages/components is future work.
