# Context compaction and projects — design

Status: approved 2026-08-19

Four changes that go together: rolling summaries so long chats stop resending
their whole history, hard caps on chat and project size, projects as an
optional grouping, and a real confirmation dialog for destructive deletes.

## Goals

- Send a summary plus recent messages to Gemini instead of the full transcript.
- Cap a chat at 100 messages and a project at 10 chats, enforced server-side.
- Let a user group chats into projects without forcing every chat into one.
- Replace the inline arm-to-confirm delete with a dialog that names what is
  being destroyed.

## Non-goals

- Cross-chat or cross-project search.
- Sharing a project between users.
- Regenerating a summary on demand from the UI.
- Undo for deletes.

## Data model

### `Project` (new)

| Field | Type | Notes |
| --- | --- | --- |
| `userId` | ObjectId, required, indexed | Every query filters by it, same rule as `Chat` |
| `name` | String, default `"New project"` | |
| timestamps | | |

### `Chat` (two new fields)

```ts
projectId: { type: Schema.Types.ObjectId, ref: "Project", default: null, index: true }
summary: {
  text: String,
  throughMessageCount: Number,
}                                    // null until the first summarize runs
```

`throughMessageCount` records how many messages the summary already covers, so
the next request sends the summary plus `messages.slice(throughMessageCount)`.
A count rather than a timestamp because it maps straight onto the array index
and cannot drift.

Existing documents need no migration: absent `projectId` reads as standalone,
absent `summary` as not-yet-summarized.

## Summarization

New pure module `lib/summary/summary.ts`, colocated test alongside:

- `needsSummary(messageCount, summary)` — true when
  `messageCount - (summary?.throughMessageCount ?? 0) >= SUMMARIZE_EVERY`.
- `buildSummaryPrompt(previousSummary, newMessages)` — the previous summary is
  an input, so the summary rolls forward and no message is summarized twice.

The Gemini call itself stays out of this module so the logic is testable
without a network or an API key, matching how `chat-request` and `history` are
already split from the routes.

### When it runs

After `streamSSE` returns and the assistant turn is persisted, inside the same
request handler. The response has already been flushed, so the user waits for
nothing — but the work still sits within the request lifecycle, which matters
on Render: a free instance can spin down and kill anything dispatched outside
it.

A failure is logged and swallowed. The chat keeps working and the next message
retries, because `needsSummary` is derived from stored state rather than from
whether the last attempt succeeded.

### How it reaches the model

The summary goes in the Gemini SDK's `config.systemInstruction`, not as a
fabricated conversation turn. It is context about the conversation, not
something a participant said, and the SDK has a dedicated slot for exactly
this. `lib/history/history.ts` then maps only the messages after
`throughMessageCount` into `Content[]`.

### Edits invalidate a summary

The client lets a user edit and resend an earlier message. When the edited
message falls inside the summarized range, the summary now describes text that
no longer exists. On edit, `summary` is cleared and rebuilds on the next
threshold crossing. Correctness over saving one API call.

## Limits

```ts
MAX_MESSAGES_PER_CHAT = 100   // user + assistant combined
MAX_CHATS_PER_PROJECT = 10
SUMMARIZE_EVERY       = 10
```

All three enforced on the server. The UI hides the relevant control, but the
server is what actually refuses, so a direct request cannot exceed them.

Rejections return 409 with a machine-readable `code` (`CHAT_FULL`,
`PROJECT_FULL`) alongside the human message, so the client can distinguish
them from the duplicate-key 409 the error handler already produces.

`MAX_MESSAGES_PER_CHAT` supersedes `MAX_HISTORY_TURNS` in `chat-request.ts`;
100 messages is stricter than 80 turns. `windowHistory` stays as the character
-count safety net.

## API

| Method | Endpoint | Behaviour |
| --- | --- | --- |
| POST | `/projects` | Create. Body `{ name? }`. |
| GET | `/projects` | List with each project's chat count. |
| PATCH | `/projects/:id` | Rename. |
| DELETE | `/projects/:id` | Deletes the project **and its own chats**. |
| POST | `/chats` | Accepts optional `{ projectId }`. 409 `PROJECT_FULL` at 10. |
| GET | `/chats` | Now returns `projectId` and `messageCount`. |
| POST | `/gemini/chat` | 409 `CHAT_FULL` at 100 messages. |

`messageCount` on the list response is what lets the client swap the composer
without fetching every chat in full.

Project deletion removes only chats whose `projectId` matches, scoped by
`userId` like every other query — a standalone chat is never touched.

## Client

- **`ConfirmDialog`** — one reusable component in `components/`, driven by
  props, replacing the inline arm-to-confirm in `ChatSidebar`. Used for both
  chat and project deletion. A project dialog names the project and its chat
  count: "Delete 'Research' and its 7 chats? This can't be undone."
- **`useProjectStore`** — a separate Zustand store; projects are their own
  concern and mixing them into `useChatStore` would grow a file already near
  its ceiling.
- **Sidebar** — a projects section above the loose chat list.
- **Composer swap** — at `MAX_MESSAGES_PER_CHAT`, the composer is replaced by
  a "Start a new chat" button.
- **Project full** — at `MAX_CHATS_PER_PROJECT`, that project's "+ New chat"
  becomes "+ New project".

## Testing

- `lib/summary/summary.test.ts` — threshold arithmetic across the boundary,
  rolling behaviour with and without a previous summary.
- `models/Project.test.ts` and additions to `Chat.test.ts` — schema validation,
  no database needed.
- `history.test.ts` — summary present routes to `systemInstruction` and only
  post-summary messages become `Content[]`.
- Client — `ConfirmDialog` in isolation, sidebar rendering of projects, the
  composer swap at the cap, and `useProjectStore` with `api/` mocked.

Both packages hold an enforced 80% coverage threshold; new modules are
expected to clear it rather than lower the bar.

## Accepted costs

- One extra Gemini call per ten messages, roughly a 10% increase in call
  volume, against a large drop in tokens per request on long chats.
- Detail outside the recent window is permanently lost from the model's view.
  That is the point of compaction, but it means the model can no longer quote
  an early message verbatim.
