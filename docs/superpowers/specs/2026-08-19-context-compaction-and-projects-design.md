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

---

# Amendments — 2026-09-01

The projects, limits and `ConfirmDialog` work in this spec shipped. Summarization
was never built: nothing in `lib/summary/`, no `summary` field, no
`SUMMARIZE_EVERY`. These amendments correct the parts of the original plan that
did not survive contact with the code, and record the decisions taken before
build.

## A1. When summarization runs

Inside the request handler, after `streamSSE` returns and the assistant turn is
stored — as the original spec requires, because work dispatched outside the
request can be killed when a Render instance spins down. The response has already
been flushed, so the user waits for nothing.

If that attempt never happens or never finishes — deploy, restart, failure — the
next request for that chat finds the threshold still crossed and summarizes
before building the model call, subject to the backoff in A4. That fallback is
what makes the summary eventually correct; the in-request attempt only keeps the
user from waiting for it.

## A2. Blocks align to answers, not to a message number

The original threshold counts raw messages. `gemini.chat.route.ts` stores an
assistant turn only when the model returned text, so a failed or instantly
aborted turn leaves a user message with no answer after it. The count goes odd,
and every later multiple of ten lands mid-exchange — the summary would record a
question and never its answer, permanently.

Summarize through the **last assistant message** at or below the threshold, so a
block always ends on a completed exchange:

```
messages:  1 you  2 AI  3 you  (failed, no AI turn stored)  4 you  5 AI ...
at 10:     do not cut at message 10 if it is a question;
           cut at the last AI answer at or below it
```

## A3. The threshold is read after the answer is stored

The assistant turn is appended with `Chat.updateOne`, not through the loaded
document, so `chat.messages.length` in the handler is one behind at exactly the
point the threshold is tested. Derive the count from the write or re-read it.
The stale document is wrong by one at the only boundary that matters.

## A4. Failure and empty results fall back to stored messages

On any summarize error, or a blank or whitespace-only result, the summary is
neither stored nor used: `throughMessageCount` does not advance and the request
proceeds on the stored raw messages exactly as it does today. A failed summary
must never degrade an answer or fail a user's message.

Repeated failure must not become a per-message tax. Track consecutive failures on
the chat; after three, stop attempting until the chat crosses the next threshold
— another `SUMMARIZE_EVERY` messages — instead of retrying on every turn. Without
this, a bad key or an exhausted quota adds a doomed call and its latency to every
message indefinitely.

## A5. The summary is data, never instruction

The summary rides in `config.systemInstruction`, which is where a model looks for
its orders. User text folded into a summary would arrive there carrying authority
it never had: "ignore your previous instructions", typed by a user, becomes a
system instruction two turns later.

The summary is wrapped in framing that marks it as an inert record of what was
discussed. A test covers an injection attempt surviving a fold.

## A6. One summarize call has a ceiling

A single call ingests at most 20 messages, two blocks. A longer backlog — chats
created under the old cap hold up to 100 — catches up over successive turns
rather than folding an entire history in one oversized call.

## A7. Concurrent writes use compare-and-set

The in-request summarize and the next request's fallback can overlap, as can two
browser tabs. Write with
`updateOne({ _id, "summary.throughMessageCount": expected }, …)` so a late writer
whose expectation no longer holds loses, instead of replacing a newer summary
with an older one. This bounds correctness, not spend: both calls still cost
money.

## A8. Chat cap drops from 100 to 50

`MAX_MESSAGES_PER_CHAT` becomes 50, mirrored in `client/src/lib/limits.ts` and
the root `CLAUDE.md`.

Two consequences worth stating. Chats already holding more than 50 messages
become full immediately and can only be continued as a new chat. And with a fold
every 10 messages, a summary is folded at most four times in a chat's life, which
sharply limits the detail decay the original spec accepted as a cost.

## A9. Editing is out of scope here

The original "Edits invalidate a summary" section assumes the client's edit
modifies stored history. It does not: the client appends the edited text as a new
message and the server has no edit endpoint, so there is nothing to invalidate.
That section is superseded. Server-side editing, and the invalidation it needs,
get their own spec.

Until then `throughMessageCount` is clamped to `messages.length` on read, so the
field cannot outrun the array once truncation becomes possible.

## A10. Summary length is bounded by the prompt

Each fold can lengthen the summary. The prompt sets an explicit ceiling and the
stored text is truncated to it, so `systemInstruction` cannot grow until it costs
more than the messages it replaced.

---

# Amendments — 2026-09-01, second pass: size measured in tokens

The message-count design above shipped and was then replaced. Ten short messages
and ten long ones cost wildly different amounts, and every threshold here exists
to control cost, so all of them now count tokens. A1–A7, A9 and A10 stand; the
changes below supersede the rest.

## B1. Folding triggers on active tokens, not message count

`SUMMARIZE_EVERY = 10` is replaced by `MAX_ACTIVE_TOKENS = 4000`. A fold is due
once the unsummarized tail reaches that, so a single long exchange can trigger
one and a run of short ones will not. A2 still holds: the block cuts at the last
assistant message, and A6's ceiling on one call's input still applies.

## B2. The chat cap counts tokens ever stored, not tokens sent

`MAX_MESSAGES_PER_CHAT = 50` is replaced by `MAX_CHAT_TOKENS = 20000`,
superseding A8.

It has to count stored tokens. Compaction deliberately holds what is *sent* near
`MAX_ACTIVE_TOKENS + MAX_SUMMARY_TOKENS` — about 4,400 — so a cap on the sent
total would never be reached and a chat would never end.

That total is therefore not something any API response can report, because the
whole transcript is never sent in one call once folding begins. `Chat.tokenCount`
carries it as a running total instead.

## B3. Prices come from the API where they exist

Assistant turns are priced by `candidatesTokenCount`, which is exact and free.
User turns are estimated from length in `lib/tokens/`, because no call can price
them before they are sent and paying for `countTokens` on every message would
cost a round trip to answer a question an estimate answers well enough.

Both are stored per message, so the active window is a sum rather than a second
source of truth. An unpriced message reads as zero from the schema but is
estimated when summed, so an older document cannot silently disable the trigger.

## B4. The summary ceiling is 400 tokens

Down from 2000 characters. The ceiling exists so the rolling summary cannot creep
toward the threshold that triggers it; at 400 against a 4000 trigger it stays an
order of magnitude clear.

## B5. Project limits

`MAX_CHATS_PER_PROJECT` drops from 10 to 5. A new `MAX_PROJECTS_PER_DAY = 5`
limits how many projects a user may create per UTC day — abuse protection rather
than a size cap, so it frees up tomorrow and deleting a project does not buy back
a slot today. It rejects with 409 and `PROJECT_LIMIT_REACHED`, distinct from the
`PROJECT_FULL` a full project returns.

UTC, not local time, so the boundary does not move under a user who travels or a
server that changes region.

## B6. The summarization prompt

The rules go in `systemInstruction` and the material in the user turn, rather
than one concatenated string. The prompt asks for one merged summary in plain
third-person prose, preserving facts, decisions, preferences and open questions
while dropping small talk, with no preamble or headers.

A5's guard is kept and applies to both halves: the transcript is material to
describe, and an instruction appearing inside it is recorded as something a
participant said rather than acted on.
