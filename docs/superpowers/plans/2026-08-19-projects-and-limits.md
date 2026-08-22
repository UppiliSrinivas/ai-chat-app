# Projects, Limits, and Confirm Dialog Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let a user group chats into optional projects (max 10 chats each), cap a chat at 100 messages, and confirm every destructive delete through a dialog that names what is being destroyed.

**Architecture:** A new `Project` Mongoose model plus a nullable `projectId` on `Chat` — absent means standalone, so no migration is needed. Limits live in one pure `lib/limits/` module shared by the routes that enforce them, and are returned to the client as `messageCount`/`chatCount` so the UI can swap controls without extra fetches. On the client, a single presentational `ConfirmDialog` replaces the inline arm-to-confirm in the sidebar, and a new `useProjectStore` keeps projects out of the already-large `useChatStore`.

**Tech Stack:** Express 5 + Mongoose 9 (ESM, `module: NodeNext` — relative imports carry `.js`), React 19 + Zustand + Tailwind, Vitest + Testing Library both sides.

**Spec:** `docs/superpowers/specs/2026-08-19-context-compaction-and-projects-design.md`

## Global Constraints

- **Summarization is out of scope.** The spec's `summary` field and `lib/summary/` module belong to plan 2 of 2. Do not add them here.
- **Server imports carry `.js`** even though sources are `.ts` (`import { Chat } from "../models/Chat.js"`).
- **Every Mongo query filters by `userId` directly** — never fetch-then-check. Another user's document must 404, not 403.
- **Comments are 1–3 lines, plain language, non-obvious only.** Explain why, never what.
- **Tests sit next to the code they cover.** `lib/limits/limits.ts` + `lib/limits/limits.test.ts`.
- **Coverage thresholds are enforced at 80%** in both packages; `npm run test:coverage` fails below it.
- **No hand-written `React.memo`, `useMemo`, or `useCallback`** — React Compiler handles it, and writing them is treated as a mistake in review.
- **Client components are presentational and props-driven** — they never read a Zustand store directly.
- **Limits are enforced server-side.** Hiding a UI control is not enforcement.
- Exact constant values: `MAX_MESSAGES_PER_CHAT = 100`, `MAX_CHATS_PER_PROJECT = 10`.
- Exact error codes: `CHAT_FULL`, `PROJECT_FULL`, both returned with HTTP 409.

---

### Task 1: Limits module

**Files:**
- Create: `server/src/lib/limits/limits.ts`
- Test: `server/src/lib/limits/limits.test.ts`

**Interfaces:**
- Consumes: nothing.
- Produces: `MAX_MESSAGES_PER_CHAT: number`, `MAX_CHATS_PER_PROJECT: number`, `isChatFull(messageCount: number): boolean`, `isProjectFull(chatCount: number): boolean`.

- [ ] **Step 1: Write the failing test**

Create `server/src/lib/limits/limits.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import {
  MAX_CHATS_PER_PROJECT,
  MAX_MESSAGES_PER_CHAT,
  isChatFull,
  isProjectFull,
} from "./limits.js";

describe("isChatFull", () => {
  it("allows a chat below the cap", () => {
    expect(isChatFull(MAX_MESSAGES_PER_CHAT - 1)).toBe(false);
  });

  // The cap is inclusive: at exactly 100 stored messages the chat is done,
  // because the next send would write the 101st.
  it("is full at exactly the cap", () => {
    expect(isChatFull(MAX_MESSAGES_PER_CHAT)).toBe(true);
  });

  it("stays full past the cap", () => {
    expect(isChatFull(MAX_MESSAGES_PER_CHAT + 5)).toBe(true);
  });

  it("allows an empty chat", () => {
    expect(isChatFull(0)).toBe(false);
  });
});

describe("isProjectFull", () => {
  it("allows a project below the cap", () => {
    expect(isProjectFull(MAX_CHATS_PER_PROJECT - 1)).toBe(false);
  });

  it("is full at exactly the cap", () => {
    expect(isProjectFull(MAX_CHATS_PER_PROJECT)).toBe(true);
  });

  it("allows an empty project", () => {
    expect(isProjectFull(0)).toBe(false);
  });
});

describe("limit values", () => {
  it("matches the values the client and docs assume", () => {
    expect(MAX_MESSAGES_PER_CHAT).toBe(100);
    expect(MAX_CHATS_PER_PROJECT).toBe(10);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd server && npx vitest run src/lib/limits/limits.test.ts`
Expected: FAIL — `Failed to resolve import "./limits.js"`

- [ ] **Step 3: Write minimal implementation**

Create `server/src/lib/limits/limits.ts`:

```ts
/**
 * Size caps shared by the routes that enforce them. Pure and separate from
 * the routes so the boundary arithmetic is testable without a database.
 */

/** User and assistant messages combined, not turns. */
export const MAX_MESSAGES_PER_CHAT = 100;

export const MAX_CHATS_PER_PROJECT = 10;

export const isChatFull = (messageCount: number): boolean => messageCount >= MAX_MESSAGES_PER_CHAT;

export const isProjectFull = (chatCount: number): boolean => chatCount >= MAX_CHATS_PER_PROJECT;
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd server && npx vitest run src/lib/limits/limits.test.ts`
Expected: PASS — 8 tests

- [ ] **Step 5: Commit**

```bash
git add server/src/lib/limits/
git commit -m "feat: add shared chat and project size limits"
```

---

### Task 2: Project model and Chat.projectId

**Files:**
- Create: `server/src/models/Project.ts`
- Create: `server/src/models/Project.test.ts`
- Modify: `server/src/models/Chat.ts`
- Modify: `server/src/models/Chat.test.ts`

**Interfaces:**
- Consumes: nothing.
- Produces: `Project` (Mongoose model), `ProjectDoc` (type), and a `projectId: Types.ObjectId | null` field on `Chat`.

- [ ] **Step 1: Write the failing test for Project**

Create `server/src/models/Project.test.ts`:

```ts
import { Types } from "mongoose";
import { describe, expect, it } from "vitest";
import { Project } from "./Project.js";

const userId = new Types.ObjectId();

describe("Project schema", () => {
  it("defaults an unnamed project to 'New project'", () => {
    const project = new Project({ userId });

    expect(project.validateSync()).toBeUndefined();
    expect(project.name).toBe("New project");
  });

  it("keeps a supplied name", () => {
    expect(new Project({ userId, name: "Research" }).name).toBe("Research");
  });

  it("trims surrounding whitespace from the name", () => {
    expect(new Project({ userId, name: "  Research  " }).name).toBe("Research");
  });

  // Every query filters by userId, so a project without one would be
  // unreachable by its owner rather than merely wrong.
  it("refuses a project with no owner", () => {
    const error = new Project({ name: "Orphan" }).validateSync();

    expect(error?.errors.userId).toBeDefined();
  });

  it("indexes userId, since every query filters on it", () => {
    expect(Project.schema.path("userId").options.index).toBe(true);
  });

  it("timestamps every document", () => {
    expect(Project.schema.get("timestamps")).toBe(true);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd server && npx vitest run src/models/Project.test.ts`
Expected: FAIL — `Failed to resolve import "./Project.js"`

- [ ] **Step 3: Create the Project model**

Create `server/src/models/Project.ts`:

```ts
import { Schema, model, type InferSchemaType } from "mongoose";

/**
 * An optional grouping for chats. A chat with no projectId is standalone,
 * which is why nothing here is required beyond the owner.
 */
const projectSchema = new Schema(
  {
    userId: { type: Schema.Types.ObjectId, ref: "User", required: true, index: true },
    name: { type: String, default: "New project", trim: true },
  },
  { timestamps: true },
);

export type ProjectDoc = InferSchemaType<typeof projectSchema>;

export const Project = model("Project", projectSchema);
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd server && npx vitest run src/models/Project.test.ts`
Expected: PASS — 6 tests

- [ ] **Step 5: Write the failing test for Chat.projectId**

Append to the `describe("Chat schema", ...)` block in `server/src/models/Chat.test.ts`:

```ts
  // A chat with no projectId is standalone. Defaulting to null rather than
  // leaving it undefined means the client always gets the field back.
  it("defaults projectId to null so a chat is standalone", () => {
    const chat = new Chat({ userId });

    expect(chat.validateSync()).toBeUndefined();
    expect(chat.projectId).toBeNull();
  });

  it("accepts a chat assigned to a project", () => {
    const projectId = new Types.ObjectId();
    const chat = new Chat({ userId, projectId });

    expect(chat.validateSync()).toBeUndefined();
    expect(chat.projectId?.toString()).toBe(projectId.toString());
  });

  it("indexes projectId, since the project view filters on it", () => {
    expect(Chat.schema.path("projectId").options.index).toBe(true);
  });
```

- [ ] **Step 6: Run test to verify it fails**

Run: `cd server && npx vitest run src/models/Chat.test.ts`
Expected: FAIL — `expected undefined to be null` on the first new test

- [ ] **Step 7: Add projectId to the Chat schema**

In `server/src/models/Chat.ts`, add the field to `chatSchema` between `userId` and `title`:

```ts
    // Null means standalone. Optional rather than required so existing chats
    // keep working without a migration.
    projectId: { type: Schema.Types.ObjectId, ref: "Project", default: null, index: true },
```

- [ ] **Step 8: Run both model suites**

Run: `cd server && npx vitest run src/models/`
Expected: PASS — all Chat and Project tests

- [ ] **Step 9: Commit**

```bash
git add server/src/models/
git commit -m "feat: add Project model and optional Chat.projectId"
```

---

### Task 3: Projects route

**Files:**
- Create: `server/src/routes/projects.route.ts`
- Modify: `server/src/app.ts`
- Modify: `CLAUDE.md`

**Interfaces:**
- Consumes: `Project`, `ProjectDoc` from Task 2; `Chat`, `isValidObjectId` from `models/Chat.js`.
- Produces: routes `POST /projects`, `GET /projects`, `PATCH /projects/:id`, `DELETE /projects/:id`. Every project response body is `{ id: string, name: string, chatCount: number, updatedAt: Date }`.

- [ ] **Step 1: Create the route**

Create `server/src/routes/projects.route.ts`:

```ts
import { Router } from "express";
import { Chat, isValidObjectId } from "../models/Chat.js";
import { Project } from "../models/Project.js";
import { requireAuth } from "../middleware/requireAuth.js";

const router = Router();

router.use(requireAuth);

const MAX_NAME_LENGTH = 200;

const readName = (value: unknown): string | null =>
  typeof value === "string" && value.trim() ? value.trim().slice(0, MAX_NAME_LENGTH) : null;

router.get("/", async (req, res) => {
  const projects = await Project.find({ userId: req.userId }).sort({ updatedAt: -1 });

  // One grouped count instead of a query per project, so the list stays a
  // fixed two round-trips however many projects a user has.
  const counts = await Chat.aggregate<{ _id: unknown; count: number }>([
    { $match: { userId: req.userId, projectId: { $ne: null } } },
    { $group: { _id: "$projectId", count: { $sum: 1 } } },
  ]);

  const countByProject = new Map(counts.map((entry) => [String(entry._id), entry.count]));

  res.json(
    projects.map((project) => ({
      id: project.id,
      name: project.name,
      chatCount: countByProject.get(project.id) ?? 0,
      updatedAt: project.updatedAt,
    })),
  );
});

router.post("/", async (req, res) => {
  const name = readName(req.body?.name) ?? "New project";

  const project = await Project.create({ userId: req.userId, name });
  res.status(201).json({ id: project.id, name: project.name, chatCount: 0, updatedAt: project.updatedAt });
});

router.patch("/:id", async (req, res) => {
  if (!isValidObjectId(req.params.id)) {
    res.status(400).json({ message: "Invalid project id." });
    return;
  }

  const name = readName(req.body?.name);
  if (!name) {
    res.status(400).json({ message: "`name` is required and must be a non-empty string." });
    return;
  }

  const project = await Project.findOneAndUpdate(
    { _id: req.params.id, userId: req.userId },
    { name },
    { new: true },
  );

  if (!project) {
    res.status(404).json({ message: "Project not found." });
    return;
  }

  const chatCount = await Chat.countDocuments({ userId: req.userId, projectId: project.id });
  res.json({ id: project.id, name: project.name, chatCount, updatedAt: project.updatedAt });
});

router.delete("/:id", async (req, res) => {
  if (!isValidObjectId(req.params.id)) {
    res.status(400).json({ message: "Invalid project id." });
    return;
  }

  const project = await Project.findOneAndDelete({ _id: req.params.id, userId: req.userId });
  if (!project) {
    res.status(404).json({ message: "Project not found." });
    return;
  }

  // Scoped by userId as well as projectId. The ownership check above already
  // passed, but keeping the filter complete means a future refactor that
  // moves this line can't turn into a cross-tenant delete.
  await Chat.deleteMany({ userId: req.userId, projectId: project.id });

  res.status(204).end();
});

export default router;
```

- [ ] **Step 2: Mount the route**

In `server/src/app.ts`, add the import beside the other route imports:

```ts
import projectsRoutes from "./routes/projects.route.js";
```

and mount it directly above the `/chats` line:

```ts
app.use("/projects", projectsRoutes);
```

- [ ] **Step 3: Verify the app still compiles and boots its tests**

Run: `cd server && npm run typecheck && npm test`
Expected: typecheck clean, all existing tests still pass

- [ ] **Step 4: Document the endpoints**

In `CLAUDE.md`, under the "Auth and persistence" bullets, add:

```markdown
- `Project` is an optional grouping: `Chat.projectId` is nullable, so a chat with no project is standalone and no migration was needed. `DELETE /projects/:id` deletes the project and its own chats — both queries scoped by `userId`, so another project's chats are never touched.
```

- [ ] **Step 5: Commit**

```bash
git add server/src/routes/projects.route.ts server/src/app.ts CLAUDE.md
git commit -m "feat: add project CRUD with cascading delete"
```

---

### Task 4: Chats route learns about projects and counts

**Files:**
- Modify: `server/src/routes/chats.route.ts`

**Interfaces:**
- Consumes: `isProjectFull`, `MAX_CHATS_PER_PROJECT` from Task 1; `Project` from Task 2.
- Produces: `GET /chats` items gain `projectId: string | null` and `messageCount: number`. `POST /chats` accepts `{ title?, projectId? }` and returns 409 `{ message, code: "PROJECT_FULL" }` when the target project already holds `MAX_CHATS_PER_PROJECT` chats.

- [ ] **Step 1: Add the imports**

At the top of `server/src/routes/chats.route.ts`:

```ts
import { MAX_CHATS_PER_PROJECT, isProjectFull } from "../lib/limits/limits.js";
import { Project } from "../models/Project.js";
```

- [ ] **Step 2: Return projectId and messageCount from the list**

Replace the whole `router.get("/", ...)` handler with:

```ts
router.get("/", async (req, res) => {
  const chats = await Chat.find({ userId: req.userId })
    .select("title projectId messages createdAt updatedAt")
    .sort({ updatedAt: -1 });

  res.json(
    chats.map((chat) => ({
      id: chat.id,
      title: chat.title,
      projectId: chat.projectId ? String(chat.projectId) : null,
      // The client swaps the composer for a "new chat" button at the cap, and
      // sending the count here saves it fetching every chat to find out.
      messageCount: chat.messages.length,
      updatedAt: chat.updatedAt,
    })),
  );
});
```

- [ ] **Step 3: Accept and validate projectId on create**

Replace the whole `router.post("/", ...)` handler with:

```ts
router.post("/", async (req, res) => {
  const titleInput = req.body?.title;
  const title = typeof titleInput === "string" && titleInput.trim() ? titleInput.trim().slice(0, MAX_TITLE_LENGTH) : "New chat";

  const projectIdInput = req.body?.projectId;
  let projectId: string | null = null;

  if (projectIdInput !== undefined && projectIdInput !== null) {
    if (typeof projectIdInput !== "string" || !isValidObjectId(projectIdInput)) {
      res.status(400).json({ message: "Invalid projectId." });
      return;
    }

    const project = await Project.findOne({ _id: projectIdInput, userId: req.userId });
    if (!project) {
      res.status(404).json({ message: "Project not found." });
      return;
    }

    const chatCount = await Chat.countDocuments({ userId: req.userId, projectId: project.id });
    if (isProjectFull(chatCount)) {
      res.status(409).json({
        message: `A project holds at most ${MAX_CHATS_PER_PROJECT} chats.`,
        code: "PROJECT_FULL",
      });
      return;
    }

    projectId = project.id;
  }

  const chat = await Chat.create({ userId: req.userId, title, projectId, messages: [] });
  res.status(201).json({
    id: chat.id,
    title: chat.title,
    projectId,
    messageCount: 0,
    updatedAt: chat.updatedAt,
    messages: [],
  });
});
```

- [ ] **Step 4: Return the same fields from the detail route**

In `router.get("/:id", ...)`, replace the final `res.json({ ... })` with:

```ts
  res.json({
    id: chat.id,
    title: chat.title,
    projectId: chat.projectId ? String(chat.projectId) : null,
    messageCount: chat.messages.length,
    updatedAt: chat.updatedAt,
    messages: chat.messages.map((message) => ({ role: message.role, content: message.content })),
  });
```

- [ ] **Step 5: Verify**

Run: `cd server && npm run typecheck && npm test`
Expected: typecheck clean, all tests pass

- [ ] **Step 6: Commit**

```bash
git add server/src/routes/chats.route.ts
git commit -m "feat: scope chats to projects and return message counts"
```

---

### Task 5: Enforce the chat message cap

**Files:**
- Modify: `server/src/routes/gemini.chat.route.ts`
- Modify: `CLAUDE.md`

**Interfaces:**
- Consumes: `isChatFull`, `MAX_MESSAGES_PER_CHAT` from Task 1.
- Produces: `POST /gemini/chat` returns 409 `{ message, code: "CHAT_FULL" }` once a chat holds `MAX_MESSAGES_PER_CHAT` messages.

- [ ] **Step 1: Add the import**

At the top of `server/src/routes/gemini.chat.route.ts`:

```ts
import { MAX_MESSAGES_PER_CHAT, isChatFull } from "../lib/limits/limits.js";
```

- [ ] **Step 2: Reject a full chat before streaming starts**

In `router.post("/", ...)`, insert this immediately after the `if (!chat) { ... }` block that returns 404:

```ts
  // Checked before flushHeaders — once the SSE stream opens, a real HTTP
  // status can no longer be returned.
  if (isChatFull(chat.messages.length)) {
    res.status(409).json({
      message: `This chat has reached its limit of ${MAX_MESSAGES_PER_CHAT} messages. Start a new chat to continue.`,
      code: "CHAT_FULL",
    });
    return;
  }
```

- [ ] **Step 3: Verify**

Run: `cd server && npm run typecheck && npm test`
Expected: typecheck clean, all tests pass

- [ ] **Step 4: Document the caps**

In `CLAUDE.md`, add to the "Hardening" bullets:

```markdown
- **Size caps live in `lib/limits/`** — 100 messages per chat, 10 chats per project, enforced in the routes and returned to the client as `messageCount`/`chatCount`. Both reject with 409 and a `code` (`CHAT_FULL`, `PROJECT_FULL`) so the client can tell them apart from the duplicate-key 409 the error handler produces. The chat cap is checked before `flushHeaders()`, since an open SSE stream can no longer carry a status.
```

- [ ] **Step 5: Commit**

```bash
git add server/src/routes/gemini.chat.route.ts CLAUDE.md
git commit -m "feat: cap a chat at 100 messages"
```

---

### Task 6: Client API modules

**Files:**
- Create: `client/src/api/projects.ts`
- Create: `client/src/api/projects.test.ts`
- Modify: `client/src/api/chats.ts`
- Modify: `client/src/api/chats.test.ts`

**Interfaces:**
- Consumes: `apiFetch` from `client/src/api/client.ts`; the routes from Tasks 3–4.
- Produces: `ProjectSummary` type; `createProject(name?: string)`, `listProjects()`, `renameProject(id, name)`, `deleteProject(id)`. `ChatSummary` gains `projectId: string | null` and `messageCount: number`; `createChat(projectId?: string)` takes an optional argument.

- [ ] **Step 1: Write the failing test for projects**

Create `client/src/api/projects.test.ts`:

```ts
import { beforeEach, describe, expect, it, vi } from 'vitest'

const { apiFetch } = vi.hoisted(() => ({ apiFetch: vi.fn() }))

vi.mock('./client', () => ({ apiFetch }))

const { createProject, deleteProject, listProjects, renameProject } = await import('./projects')

beforeEach(() => {
  apiFetch.mockReset()
  apiFetch.mockResolvedValue(undefined)
})

describe('projects api', () => {
  it('lists projects with a plain GET', async () => {
    await listProjects()

    expect(apiFetch).toHaveBeenCalledExactlyOnceWith('/projects')
  })

  it('creates a project with the given name', async () => {
    await createProject('Research')

    expect(apiFetch).toHaveBeenCalledExactlyOnceWith('/projects', {
      method: 'POST',
      body: JSON.stringify({ name: 'Research' }),
    })
  })

  // Omitting the name lets the server apply its own default rather than the
  // client inventing a second source of truth for it.
  it('creates a project with no name when none is given', async () => {
    await createProject()

    expect(apiFetch).toHaveBeenCalledExactlyOnceWith('/projects', {
      method: 'POST',
      body: JSON.stringify({}),
    })
  })

  it('renames a project', async () => {
    await renameProject('p1', 'Renamed')

    expect(apiFetch).toHaveBeenCalledExactlyOnceWith('/projects/p1', {
      method: 'PATCH',
      body: JSON.stringify({ name: 'Renamed' }),
    })
  })

  it('deletes a project', async () => {
    await deleteProject('p1')

    expect(apiFetch).toHaveBeenCalledExactlyOnceWith('/projects/p1', { method: 'DELETE' })
  })

  it('returns whatever the server sent back', async () => {
    const projects = [{ id: 'p1', name: 'Research', chatCount: 3, updatedAt: '2026-01-01' }]
    apiFetch.mockResolvedValue(projects)

    await expect(listProjects()).resolves.toEqual(projects)
  })

  it('lets a failure propagate', async () => {
    apiFetch.mockRejectedValue(new Error('Project not found.'))

    await expect(deleteProject('missing')).rejects.toThrow('Project not found.')
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd client && npx vitest run src/api/projects.test.ts`
Expected: FAIL — cannot resolve `./projects`

- [ ] **Step 3: Create the module**

Create `client/src/api/projects.ts`:

```ts
import { apiFetch } from './client'

export type ProjectSummary = {
  id: string
  name: string
  chatCount: number
  updatedAt: string
}

export function createProject(name?: string): Promise<ProjectSummary> {
  return apiFetch('/projects', { method: 'POST', body: JSON.stringify(name ? { name } : {}) })
}

export function listProjects(): Promise<ProjectSummary[]> {
  return apiFetch('/projects')
}

export function renameProject(id: string, name: string): Promise<ProjectSummary> {
  return apiFetch(`/projects/${id}`, { method: 'PATCH', body: JSON.stringify({ name }) })
}

export function deleteProject(id: string): Promise<void> {
  return apiFetch(`/projects/${id}`, { method: 'DELETE' })
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd client && npx vitest run src/api/projects.test.ts`
Expected: PASS — 7 tests

- [ ] **Step 5: Widen the chat types**

In `client/src/api/chats.ts`, replace the `ChatSummary` type and `createChat` function with:

```ts
export type ChatSummary = {
  id: string
  title: string
  projectId: string | null
  messageCount: number
  updatedAt: string
}

export function createChat(projectId?: string): Promise<ChatSummary & { messages: [] }> {
  return apiFetch('/chats', {
    method: 'POST',
    body: JSON.stringify(projectId ? { projectId } : {}),
  })
}
```

- [ ] **Step 6: Cover the new argument**

In `client/src/api/chats.test.ts`, replace the `it('creates a chat with an empty JSON body', ...)` test with:

```ts
  // POST with an empty object rather than no body: the server's json parser
  // leaves req.body undefined otherwise, which its validation rejects.
  it('creates a standalone chat with an empty JSON body', async () => {
    await createChat()

    expect(apiFetch).toHaveBeenCalledExactlyOnceWith('/chats', { method: 'POST', body: '{}' })
  })

  it('creates a chat inside a project', async () => {
    await createChat('p1')

    expect(apiFetch).toHaveBeenCalledExactlyOnceWith('/chats', {
      method: 'POST',
      body: JSON.stringify({ projectId: 'p1' }),
    })
  })
```

- [ ] **Step 7: Run both api suites**

Run: `cd client && npx vitest run src/api/`
Expected: PASS

- [ ] **Step 8: Commit**

```bash
git add client/src/api/
git commit -m "feat: add projects api client and chat project scoping"
```

---

### Task 7: ConfirmDialog component

**Files:**
- Create: `client/src/components/confirm-dialog/ConfirmDialog.tsx`
- Create: `client/src/components/confirm-dialog/ConfirmDialog.test.tsx`

**Interfaces:**
- Consumes: nothing.
- Produces: `ConfirmDialog` (default export) and `ConfirmDialogProps` with `{ isOpen: boolean, title: string, body: string, confirmLabel?: string, onConfirm: () => void, onCancel: () => void }`.

- [ ] **Step 1: Write the failing test**

Create `client/src/components/confirm-dialog/ConfirmDialog.test.tsx`:

```tsx
import { describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import ConfirmDialog, { type ConfirmDialogProps } from './ConfirmDialog'

const setup = (props: Partial<ConfirmDialogProps> = {}) => {
  const handlers = { onConfirm: vi.fn(), onCancel: vi.fn() }
  render(
    <ConfirmDialog
      isOpen
      title='Delete "First chat"?'
      body="This can't be undone."
      {...handlers}
      {...props}
    />,
  )
  return { ...handlers, user: userEvent.setup() }
}

describe('ConfirmDialog', () => {
  it('renders nothing while closed', () => {
    setup({ isOpen: false })

    expect(screen.queryByRole('dialog')).toBeNull()
  })

  it('names what is being deleted', () => {
    setup()

    expect(screen.getByRole('dialog')).toHaveAccessibleName('Delete "First chat"?')
    expect(screen.getByText("This can't be undone.")).toBeInTheDocument()
  })

  it('confirms on the confirm button', async () => {
    const { onConfirm, onCancel, user } = setup()

    await user.click(screen.getByRole('button', { name: 'Delete' }))

    expect(onConfirm).toHaveBeenCalledOnce()
    expect(onCancel).not.toHaveBeenCalled()
  })

  it('cancels on the cancel button', async () => {
    const { onConfirm, onCancel, user } = setup()

    await user.click(screen.getByRole('button', { name: 'Cancel' }))

    expect(onCancel).toHaveBeenCalledOnce()
    expect(onConfirm).not.toHaveBeenCalled()
  })

  it('accepts a custom confirm label', () => {
    setup({ confirmLabel: 'Delete project and chats' })

    expect(screen.getByRole('button', { name: 'Delete project and chats' })).toBeInTheDocument()
  })

  // Escape is the expected way out of a modal, and a destructive dialog must
  // never trap someone who opened it by mistake.
  it('cancels on Escape', async () => {
    const { onCancel, onConfirm, user } = setup()

    await user.keyboard('{Escape}')

    expect(onCancel).toHaveBeenCalledOnce()
    expect(onConfirm).not.toHaveBeenCalled()
  })

  it('cancels when the backdrop is clicked', async () => {
    const { onCancel, user } = setup()

    await user.click(document.querySelector('div[aria-hidden="true"]')!)

    expect(onCancel).toHaveBeenCalledOnce()
  })

  // Confirm must never be the default focus target: the whole point is to
  // make destroying something deliberate.
  it('puts initial focus on cancel', () => {
    setup()

    expect(screen.getByRole('button', { name: 'Cancel' })).toHaveFocus()
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd client && npx vitest run src/components/confirm-dialog/`
Expected: FAIL — cannot resolve `./ConfirmDialog`

- [ ] **Step 3: Write the component**

Create `client/src/components/confirm-dialog/ConfirmDialog.tsx`:

```tsx
import { useEffect, useRef } from 'react'

export type ConfirmDialogProps = {
  isOpen: boolean
  title: string
  body: string
  confirmLabel?: string
  onConfirm: () => void
  onCancel: () => void
}

export default function ConfirmDialog({
  isOpen,
  title,
  body,
  confirmLabel = 'Delete',
  onConfirm,
  onCancel,
}: ConfirmDialogProps) {
  const cancelRef = useRef<HTMLButtonElement>(null)

  // Focus lands on cancel, not confirm — destroying something should take a
  // deliberate move, never a stray Enter press.
  useEffect(() => {
    if (isOpen) cancelRef.current?.focus()
  }, [isOpen])

  useEffect(() => {
    if (!isOpen) return

    const handleKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onCancel()
    }

    window.addEventListener('keydown', handleKey)
    return () => window.removeEventListener('keydown', handleKey)
  }, [isOpen, onCancel])

  if (!isOpen) return null

  return (
    <>
      <div onClick={onCancel} className="fixed inset-0 z-[60] bg-black/70" aria-hidden="true" />
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="confirm-dialog-title"
        className="fixed top-1/2 left-1/2 z-[70] w-[min(24rem,calc(100vw-2rem))] -translate-x-1/2 -translate-y-1/2 rounded-2xl border border-zinc-800 bg-zinc-900 p-5"
      >
        <h2 id="confirm-dialog-title" className="text-base font-medium text-zinc-100">
          {title}
        </h2>
        <p className="mt-2 text-sm leading-6 text-zinc-400">{body}</p>

        <div className="mt-5 flex justify-end gap-2">
          <button
            ref={cancelRef}
            type="button"
            onClick={onCancel}
            className="rounded-full border border-zinc-700 px-4 py-2 text-sm font-medium text-zinc-100 hover:bg-zinc-800"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={onConfirm}
            className="rounded-full bg-red-600 px-4 py-2 text-sm font-medium text-white hover:bg-red-500"
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </>
  )
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd client && npx vitest run src/components/confirm-dialog/`
Expected: PASS — 8 tests

- [ ] **Step 5: Commit**

```bash
git add client/src/components/confirm-dialog/
git commit -m "feat: add a reusable confirm dialog"
```

---

### Task 8: Project store

**Files:**
- Create: `client/src/hooks/useProjectStore.ts`
- Create: `client/src/hooks/useProjectStore.test.ts`

**Interfaces:**
- Consumes: `createProject`, `listProjects`, `renameProject`, `deleteProject`, `ProjectSummary` from Task 6.
- Produces: `useProjectStore` with state `{ projects: ProjectSummary[], error: string | null }` and actions `loadProjects()`, `addProject(name?: string)`, `renameProject(id, name)`, `removeProject(id)`, `reset()`.

- [ ] **Step 1: Write the failing test**

Create `client/src/hooks/useProjectStore.test.ts`:

```ts
import { beforeEach, describe, expect, it, vi } from 'vitest'

const api = vi.hoisted(() => ({
  createProject: vi.fn(),
  listProjects: vi.fn(),
  renameProject: vi.fn(),
  deleteProject: vi.fn(),
}))

vi.mock('../api/projects', () => api)

const { useProjectStore } = await import('./useProjectStore')

const research = { id: 'p1', name: 'Research', chatCount: 3, updatedAt: '2026-01-01' }
const initial = useProjectStore.getState()

beforeEach(() => {
  useProjectStore.setState(initial, true)
  api.createProject.mockReset().mockResolvedValue(research)
  api.listProjects.mockReset().mockResolvedValue([research])
  api.renameProject.mockReset().mockResolvedValue({ ...research, name: 'Renamed' })
  api.deleteProject.mockReset().mockResolvedValue(undefined)
})

describe('loadProjects', () => {
  it('stores what the server returns', async () => {
    await useProjectStore.getState().loadProjects()

    expect(useProjectStore.getState().projects).toEqual([research])
  })

  it('records a failure without throwing', async () => {
    api.listProjects.mockRejectedValue(new Error('Network down'))

    await useProjectStore.getState().loadProjects()

    expect(useProjectStore.getState().error).toBe('Network down')
    expect(useProjectStore.getState().projects).toEqual([])
  })
})

describe('addProject', () => {
  it('puts the new project at the front of the list', async () => {
    useProjectStore.setState({ projects: [{ ...research, id: 'p0', name: 'Older' }] })

    await useProjectStore.getState().addProject('Research')

    expect(useProjectStore.getState().projects.map((p) => p.id)).toEqual(['p1', 'p0'])
    expect(api.createProject).toHaveBeenCalledExactlyOnceWith('Research')
  })
})

describe('renameProject', () => {
  it('replaces the renamed project in place', async () => {
    useProjectStore.setState({ projects: [research] })

    await useProjectStore.getState().renameProject('p1', 'Renamed')

    expect(useProjectStore.getState().projects[0].name).toBe('Renamed')
  })
})

describe('removeProject', () => {
  it('drops the project from the list', async () => {
    useProjectStore.setState({ projects: [research] })

    await useProjectStore.getState().removeProject('p1')

    expect(useProjectStore.getState().projects).toEqual([])
    expect(api.deleteProject).toHaveBeenCalledExactlyOnceWith('p1')
  })

  // A failed delete must not remove the row, or the sidebar shows something
  // gone that is still on the server until the next reload.
  it('keeps the project when the delete fails', async () => {
    api.deleteProject.mockRejectedValue(new Error('Project not found.'))
    useProjectStore.setState({ projects: [research] })

    await useProjectStore.getState().removeProject('p1')

    expect(useProjectStore.getState().projects).toEqual([research])
    expect(useProjectStore.getState().error).toBe('Project not found.')
  })
})

describe('reset', () => {
  it('clears everything for the next signed-in user', () => {
    useProjectStore.setState({ projects: [research], error: 'stale' })

    useProjectStore.getState().reset()

    expect(useProjectStore.getState().projects).toEqual([])
    expect(useProjectStore.getState().error).toBeNull()
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd client && npx vitest run src/hooks/useProjectStore.test.ts`
Expected: FAIL — cannot resolve `./useProjectStore`

- [ ] **Step 3: Write the store**

Create `client/src/hooks/useProjectStore.ts`:

```ts
import { create } from 'zustand'
import {
  createProject,
  deleteProject,
  listProjects,
  renameProject as renameProjectRequest,
  type ProjectSummary,
} from '../api/projects'

type ProjectState = {
  projects: ProjectSummary[]
  error: string | null
  loadProjects: () => Promise<void>
  addProject: (name?: string) => Promise<void>
  renameProject: (id: string, name: string) => Promise<void>
  removeProject: (id: string) => Promise<void>
  reset: () => void
}

const messageFor = (error: unknown): string =>
  error instanceof Error ? error.message : 'Something went wrong'

export const useProjectStore = create<ProjectState>((set, get) => ({
  projects: [],
  error: null,

  loadProjects: async () => {
    try {
      set({ projects: await listProjects(), error: null })
    } catch (error) {
      set({ error: messageFor(error) })
    }
  },

  addProject: async (name) => {
    try {
      const project = await createProject(name)
      set({ projects: [project, ...get().projects], error: null })
    } catch (error) {
      set({ error: messageFor(error) })
    }
  },

  renameProject: async (id, name) => {
    try {
      const updated = await renameProjectRequest(id, name)
      set({
        projects: get().projects.map((project) => (project.id === id ? updated : project)),
        error: null,
      })
    } catch (error) {
      set({ error: messageFor(error) })
    }
  },

  // Removed only after the server confirms — dropping the row first would
  // show a project gone that still exists until the next reload.
  removeProject: async (id) => {
    try {
      await deleteProject(id)
      set({ projects: get().projects.filter((project) => project.id !== id), error: null })
    } catch (error) {
      set({ error: messageFor(error) })
    }
  },

  reset: () => set({ projects: [], error: null }),
}))
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd client && npx vitest run src/hooks/useProjectStore.test.ts`
Expected: PASS — 8 tests

- [ ] **Step 5: Clear projects on sign-out too**

In `client/src/App.tsx`, add the import:

```ts
import { useProjectStore } from './hooks/useProjectStore'
```

and extend the existing sign-out reset effect so it reads:

```ts
  // Clears any in-memory chat list/messages from a previous session so the
  // next person to sign in on this browser never sees them.
  useEffect(() => {
    if (status === 'signedOut') {
      useChatStore.getState().reset()
      useProjectStore.getState().reset()
    }
  }, [status])
```

- [ ] **Step 6: Cover it**

In `client/src/App.test.tsx`, add inside `describe('App', ...)`:

```tsx
  it('clears the previous session projects on sign out', () => {
    const reset = vi.fn()
    useProjectStore.setState({ reset })
    useAuthStore.setState({ status: 'signedOut' })

    render(<App />)

    expect(reset).toHaveBeenCalled()
  })
```

and add the import at the top beside the other store imports:

```ts
const { useProjectStore } = await import('./hooks/useProjectStore')
```

- [ ] **Step 7: Run the suites**

Run: `cd client && npx vitest run src/hooks/ src/App.test.tsx`
Expected: PASS

- [ ] **Step 8: Commit**

```bash
git add client/src/hooks/useProjectStore.ts client/src/hooks/useProjectStore.test.ts client/src/App.tsx client/src/App.test.tsx
git commit -m "feat: add project store and clear it on sign out"
```

---

### Task 9: Sidebar projects section and dialog wiring

**Files:**
- Modify: `client/src/components/sidebar/ChatSidebar.tsx`
- Modify: `client/src/components/sidebar/ChatSidebar.test.tsx`
- Modify: `client/CLAUDE.md`

**Interfaces:**
- Consumes: `ConfirmDialog` from Task 7; `ProjectSummary` from Task 6; `MAX_CHATS_PER_PROJECT` is mirrored client-side via `project.chatCount`.
- Produces: `ChatSidebarProps` gains `projects: ProjectSummary[]`, `onNewProject: () => void`, `onNewChatInProject: (projectId: string) => void`, `onDeleteProject: (projectId: string) => void`. The `pendingDeleteId` inline confirm is removed.

- [ ] **Step 1: Replace the inline confirm with dialog state**

In `client/src/components/sidebar/ChatSidebar.tsx`, replace the `pendingDeleteId` state and the `handleDelete` function with:

```tsx
  // What the confirm dialog is currently asking about, or null when closed.
  const [pendingDelete, setPendingDelete] = useState<
    { kind: 'chat'; id: string; title: string } | { kind: 'project'; id: string; name: string; chatCount: number } | null
  >(null)

  const confirmDelete = () => {
    if (!pendingDelete) return
    if (pendingDelete.kind === 'chat') onDelete(pendingDelete.id)
    else onDeleteProject(pendingDelete.id)
    setPendingDelete(null)
  }
```

- [ ] **Step 2: Simplify the per-chat delete button**

Replace the chat row's delete `<button>` (the one with `onBlur` and the `Check`/`Trash2` swap) with:

```tsx
              <button
                type="button"
                onClick={(event) => {
                  event.stopPropagation()
                  setPendingDelete({ kind: 'chat', id: chat.id, title: chat.title })
                }}
                aria-label={`Delete "${chat.title}"`}
                className="absolute top-1/2 right-1.5 flex h-7 w-7 -translate-y-1/2 items-center justify-center rounded-full text-zinc-500 opacity-0 hover:bg-zinc-700 hover:text-zinc-100 group-hover:opacity-100"
              >
                <Trash2 size={14} />
              </button>
```

`Check` is no longer used — remove it from the `lucide-react` import, and add `Folder`.

- [ ] **Step 3: Add the projects section**

Directly above the existing `<nav>` that lists chats, insert:

```tsx
        <div className="px-2 pb-2">
          <div className="flex items-center justify-between px-3 py-1">
            <span className="text-xs font-medium text-zinc-500">Projects</span>
            <button
              type="button"
              onClick={onNewProject}
              aria-label="New project"
              className="flex h-6 w-6 items-center justify-center rounded-full text-zinc-500 hover:bg-zinc-800 hover:text-zinc-100"
            >
              <Plus size={14} />
            </button>
          </div>

          {projects.map((project) => (
            <div key={project.id} className="group/project relative">
              <div className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-sm text-zinc-300">
                <Folder size={14} className="shrink-0" />
                <span className="flex-1 truncate">{project.name}</span>
                <span className="text-xs text-zinc-500">{project.chatCount}/10</span>
              </div>

              {/* A full project can't take another chat, so it offers the only
                  action that still moves the user forward. */}
              {project.chatCount >= 10 ? (
                <button
                  type="button"
                  onClick={onNewProject}
                  className="ml-8 px-3 pb-1 text-left text-xs text-zinc-500 hover:text-zinc-300"
                >
                  + New project
                </button>
              ) : (
                <button
                  type="button"
                  onClick={() => onNewChatInProject(project.id)}
                  className="ml-8 px-3 pb-1 text-left text-xs text-zinc-500 hover:text-zinc-300"
                >
                  + New chat
                </button>
              )}

              <button
                type="button"
                onClick={() =>
                  setPendingDelete({
                    kind: 'project',
                    id: project.id,
                    name: project.name,
                    chatCount: project.chatCount,
                  })
                }
                aria-label={`Delete project "${project.name}"`}
                className="absolute top-2 right-1.5 flex h-6 w-6 items-center justify-center rounded-full text-zinc-500 opacity-0 hover:bg-zinc-700 hover:text-zinc-100 group-hover/project:opacity-100"
              >
                <Trash2 size={13} />
              </button>
            </div>
          ))}
        </div>
```

- [ ] **Step 4: Render the dialog**

Immediately before the closing `</aside>`, add:

```tsx
        <ConfirmDialog
          isOpen={pendingDelete !== null}
          title={
            pendingDelete?.kind === 'project'
              ? `Delete "${pendingDelete.name}"?`
              : `Delete "${pendingDelete?.title ?? ''}"?`
          }
          body={
            pendingDelete?.kind === 'project'
              ? `This permanently deletes the project and its ${pendingDelete.chatCount} chat${pendingDelete.chatCount === 1 ? '' : 's'}. This can't be undone.`
              : "This permanently deletes the chat and its messages. This can't be undone."
          }
          confirmLabel={pendingDelete?.kind === 'project' ? 'Delete project and chats' : 'Delete'}
          onConfirm={confirmDelete}
          onCancel={() => setPendingDelete(null)}
        />
```

and add the import at the top:

```tsx
import ConfirmDialog from '../confirm-dialog/ConfirmDialog'
```

- [ ] **Step 5: Update the props type and signature**

Add to `ChatSidebarProps`:

```tsx
  projects: ProjectSummary[]
  onNewProject: () => void
  onNewChatInProject: (projectId: string) => void
  onDeleteProject: (projectId: string) => void
```

with the import:

```tsx
import type { ProjectSummary } from '../../api/projects'
```

and destructure all four in the function signature.

- [ ] **Step 6: Update the test setup and replace the inline-confirm tests**

In `client/src/components/sidebar/ChatSidebar.test.tsx`, add to `handlers`:

```tsx
    onNewProject: vi.fn(),
    onNewChatInProject: vi.fn(),
    onDeleteProject: vi.fn(),
```

and add `projects={[]}` to the `render` call beside `user={null}`.

Then replace the three delete tests (`'deletes a chat without also selecting it, once confirmed'`, `'does not delete on the first click alone'`, `'disarms the confirm when focus moves elsewhere'`) with:

```tsx
  it('asks before deleting a chat', async () => {
    const { onDelete, onSelect, user } = setup()

    await user.click(screen.getByRole('button', { name: 'Delete "First chat"' }))

    expect(onDelete).not.toHaveBeenCalled()
    expect(screen.getByRole('dialog')).toHaveAccessibleName('Delete "First chat"?')
    expect(onSelect).not.toHaveBeenCalled()
  })

  it('deletes the chat once confirmed', async () => {
    const { onDelete, user } = setup()

    await user.click(screen.getByRole('button', { name: 'Delete "First chat"' }))
    await user.click(screen.getByRole('button', { name: 'Delete' }))

    expect(onDelete).toHaveBeenCalledExactlyOnceWith('a')
  })

  it('leaves the chat alone when cancelled', async () => {
    const { onDelete, user } = setup()

    await user.click(screen.getByRole('button', { name: 'Delete "First chat"' }))
    await user.click(screen.getByRole('button', { name: 'Cancel' }))

    expect(onDelete).not.toHaveBeenCalled()
    expect(screen.queryByRole('dialog')).toBeNull()
  })
```

- [ ] **Step 7: Add the project tests**

Append inside `describe('ChatSidebar', ...)`:

```tsx
  const project = { id: 'p1', name: 'Research', chatCount: 3, updatedAt: '' }

  it('lists projects with their chat counts', () => {
    setup({ projects: [project] })

    expect(screen.getByText('Research')).toBeInTheDocument()
    expect(screen.getByText('3/10')).toBeInTheDocument()
  })

  it('starts a new chat inside a project', async () => {
    const { onNewChatInProject, user } = setup({ projects: [project] })

    await user.click(screen.getByRole('button', { name: '+ New chat' }))

    expect(onNewChatInProject).toHaveBeenCalledExactlyOnceWith('p1')
  })

  // A full project can't take another chat, so the only forward action left
  // is starting a new project.
  it('offers a new project instead of a new chat when full', async () => {
    const { onNewProject, onNewChatInProject, user } = setup({
      projects: [{ ...project, chatCount: 10 }],
    })

    expect(screen.queryByRole('button', { name: '+ New chat' })).toBeNull()
    await user.click(screen.getByRole('button', { name: '+ New project' }))

    expect(onNewProject).toHaveBeenCalledOnce()
    expect(onNewChatInProject).not.toHaveBeenCalled()
  })

  // Deleting a project destroys its chats, so the dialog has to say the
  // number out loud rather than a generic warning.
  it('names the chat count when deleting a project', async () => {
    const { onDeleteProject, user } = setup({ projects: [project] })

    await user.click(screen.getByRole('button', { name: 'Delete project "Research"' }))

    expect(screen.getByText(/its 3 chats/)).toBeInTheDocument()
    expect(onDeleteProject).not.toHaveBeenCalled()

    await user.click(screen.getByRole('button', { name: 'Delete project and chats' }))

    expect(onDeleteProject).toHaveBeenCalledExactlyOnceWith('p1')
  })

  it('says "1 chat" rather than "1 chats"', async () => {
    const { user } = setup({ projects: [{ ...project, chatCount: 1 }] })

    await user.click(screen.getByRole('button', { name: 'Delete project "Research"' }))

    expect(screen.getByText(/its 1 chat\./)).toBeInTheDocument()
  })
```

- [ ] **Step 8: Run the suite**

Run: `cd client && npx vitest run src/components/sidebar/`
Expected: PASS

- [ ] **Step 9: Document the pattern**

In `client/CLAUDE.md`, under "Coding rules", add:

```markdown
**Destructive actions go through `ConfirmDialog`** — never an inline arm-to-confirm. A project delete cascades to its chats, so its dialog states the chat count explicitly rather than a generic warning.
```

- [ ] **Step 10: Commit**

```bash
git add client/src/components/sidebar/ client/CLAUDE.md
git commit -m "feat: add projects to the sidebar behind a confirm dialog"
```

---

### Task 10: Wire the chat page and swap the composer at the cap

**Files:**
- Modify: `client/src/pages/chat/index.tsx`
- Modify: `client/src/pages/chat/index.test.tsx`
- Modify: `client/src/hooks/useChatStore.ts`
- Modify: `client/src/hooks/useChatStore.test.ts`

**Interfaces:**
- Consumes: `useProjectStore` from Task 8; the sidebar props from Task 9; `messageCount` on `ChatSummary` from Task 6.
- Produces: `useChatStore.startNewChatInProject(projectId: string)` and a derived `isChatFull` boolean on the page.

- [ ] **Step 1: Write the failing store test**

In `client/src/hooks/useChatStore.test.ts`, add:

```ts
  it('creates a chat inside the given project', async () => {
    await useChatStore.getState().startNewChatInProject('p1')

    expect(api.createChat).toHaveBeenCalledExactlyOnceWith('p1')
  })
```

(using whatever name the existing suite already binds the mocked `api/chats` module to).

- [ ] **Step 2: Run test to verify it fails**

Run: `cd client && npx vitest run src/hooks/useChatStore.test.ts`
Expected: FAIL — `startNewChatInProject is not a function`

- [ ] **Step 3: Add the action**

In `client/src/hooks/useChatStore.ts`, add `startNewChatInProject: (projectId: string) => Promise<void>` to `ChatState`, and implement it beside `startNewChat`:

```ts
    startNewChatInProject: async (projectId) => {
      try {
        const chat = await createChat(projectId)
        set({ chatId: chat.id, turns: [], error: null, chats: [chat, ...get().chats] })
      } catch (error) {
        set({ error: error instanceof Error ? error.message : 'Could not create the chat' })
      }
    },
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd client && npx vitest run src/hooks/useChatStore.test.ts`
Expected: PASS

- [ ] **Step 5: Write the failing page test**

In `client/src/pages/chat/index.test.tsx`, extend the `ChatSidebar` mock to expose the new props:

```tsx
vi.mock('../../components/sidebar/ChatSidebar', () => ({
  default: ({ isOpen, user, projects, onSignOut, onUpgrade, onNewProject }: {
    isOpen: boolean
    user: { email: string | null } | null
    projects: { id: string }[]
    onSignOut: () => void
    onUpgrade: () => void
    onNewProject: () => void
  }) => (
    <div>
      <span>sidebar {isOpen ? 'open' : 'closed'}</span>
      <span>account {user?.email ?? 'none'}</span>
      <span>projects {projects.length}</span>
      <button type="button" onClick={onSignOut}>sidebar sign out</button>
      <button type="button" onClick={onUpgrade}>sidebar upgrade</button>
      <button type="button" onClick={onNewProject}>sidebar new project</button>
    </div>
  ),
}))
```

and add:

```tsx
  it('loads projects on mount', () => {
    const loadProjects = vi.fn()
    useProjectStore.setState({ loadProjects })

    render(<ChatPage />)

    expect(loadProjects).toHaveBeenCalledOnce()
  })

  // At the cap the chat is read-only: the only way forward is a new chat, so
  // the composer is replaced rather than merely disabled.
  it('replaces the composer with a new-chat button at the message cap', () => {
    useChatStore.setState({
      chatId: 'c1',
      turns: [turn('t1', 'hi', 'hello')],
      chats: [{ id: 'c1', title: 'Full', projectId: null, messageCount: 100, updatedAt: '' }],
    })

    render(<ChatPage />)

    expect(screen.queryByRole('button', { name: 'send' })).toBeNull()
    expect(screen.getByRole('button', { name: 'Start a new chat' })).toBeInTheDocument()
  })

  it('keeps the composer below the cap', () => {
    useChatStore.setState({
      chatId: 'c1',
      turns: [turn('t1', 'hi', 'hello')],
      chats: [{ id: 'c1', title: 'Fine', projectId: null, messageCount: 99, updatedAt: '' }],
    })

    render(<ChatPage />)

    expect(screen.getByRole('button', { name: 'send' })).toBeInTheDocument()
  })

  it('starts a new chat from the cap notice', async () => {
    const startNewChat = vi.fn()
    useChatStore.setState({
      chatId: 'c1',
      turns: [turn('t1', 'hi', 'hello')],
      chats: [{ id: 'c1', title: 'Full', projectId: null, messageCount: 100, updatedAt: '' }],
      startNewChat,
    })
    const user = userEvent.setup()
    render(<ChatPage />)

    await user.click(screen.getByRole('button', { name: 'Start a new chat' }))

    expect(startNewChat).toHaveBeenCalledOnce()
  })
```

Add the store import beside the others:

```tsx
const { useProjectStore } = await import('../../hooks/useProjectStore')
```

and reset it in `beforeEach`:

```tsx
  useProjectStore.setState({ ...initialProject, loadProjects: vi.fn() }, true)
```

with `const initialProject = useProjectStore.getState()` declared next to the other initial-state constants.

- [ ] **Step 6: Run test to verify it fails**

Run: `cd client && npx vitest run src/pages/chat/`
Expected: FAIL — no "Start a new chat" button, `loadProjects` not called

- [ ] **Step 7: Wire the page**

In `client/src/pages/chat/index.tsx`:

Add imports:

```tsx
import { useProjectStore } from '../../hooks/useProjectStore'
```

Add the store reads beside the existing ones:

```tsx
    const startNewChatInProject = useChatStore((state) => state.startNewChatInProject)
    const projects = useProjectStore((state) => state.projects)
    const loadProjects = useProjectStore((state) => state.loadProjects)
    const addProject = useProjectStore((state) => state.addProject)
    const removeProject = useProjectStore((state) => state.removeProject)
```

Load projects alongside chats:

```tsx
    useEffect(() => {
        loadProjects()
    }, [loadProjects])
```

Derive the cap from the chat list, named before the JSX:

```tsx
    const activeChat = chats.find((chat) => chat.id === chatId)
    const isChatFull = (activeChat?.messageCount ?? 0) >= 100
```

Pass the new props to `<ChatSidebar>`:

```tsx
                projects={projects}
                onNewProject={() => addProject()}
                onNewChatInProject={startNewChatInProject}
                onDeleteProject={removeProject}
```

Replace **both** `<Composer ... />` usages with this expression (the empty-state one and the bottom-bar one):

```tsx
                            {isChatFull ? (
                                <div className="flex justify-center px-4 py-3">
                                    <button
                                        type="button"
                                        onClick={startNewChat}
                                        className="rounded-full border border-zinc-700 px-4 py-2 text-sm font-medium text-zinc-100 hover:bg-zinc-800"
                                    >
                                        Start a new chat
                                    </button>
                                </div>
                            ) : (
                                <Composer onSend={sendMessage} isStreaming={isStreaming} onStop={stopStreaming} />
                            )}
```

- [ ] **Step 8: Run test to verify it passes**

Run: `cd client && npx vitest run src/pages/chat/ src/hooks/`
Expected: PASS

- [ ] **Step 9: Commit**

```bash
git add client/src/pages/chat/ client/src/hooks/useChatStore.ts client/src/hooks/useChatStore.test.ts
git commit -m "feat: swap the composer for a new-chat button at the message cap"
```

---

### Task 11: Full verification

**Files:** none — this task only runs checks and fixes whatever they surface.

- [ ] **Step 1: Server gate**

Run: `cd server && npm run typecheck && npm run test:coverage`
Expected: typecheck clean, all tests pass, coverage at or above 80% on every metric

- [ ] **Step 2: Client gate**

Run: `cd client && npx tsc --noEmit && npm run lint && npm run test:coverage`
Expected: typecheck clean, lint clean, all tests pass, coverage at or above 80%

Note: `npm run build` does **not** typecheck on the client — it is plain `vite build`. `tsc --noEmit` is the only thing that catches type errors, so do not substitute one for the other.

- [ ] **Step 3: Drive it for real**

Start local MongoDB, then `cd server && npm run dev` and `cd client && npm run dev`. In the browser:

1. Create a project, confirm it appears with `0/10`.
2. Create a chat inside it, confirm the count becomes `1/10`.
3. Delete the chat — confirm the dialog names it, and Cancel leaves it alone.
4. Delete the project — confirm the dialog says "and its N chats", and that confirming removes both the project and its chats while a standalone chat survives.

- [ ] **Step 4: Commit any fixes**

```bash
git add -A
git commit -m "fix: address issues found during verification"
```

---

## Self-review

**Spec coverage (plan 1 scope only):**

| Spec requirement | Task |
| --- | --- |
| `Project` model, `userId` indexed | 2 |
| `Chat.projectId` nullable, no migration | 2 |
| `MAX_MESSAGES_PER_CHAT = 100`, `MAX_CHATS_PER_PROJECT = 10` | 1 |
| Limits enforced server-side | 4, 5 |
| 409 with `CHAT_FULL` / `PROJECT_FULL` codes | 4, 5 |
| Project CRUD endpoints | 3 |
| Cascade delete scoped by `userId` | 3 |
| `messageCount` / `chatCount` in responses | 3, 4 |
| `ConfirmDialog`, reusable and props-driven | 7 |
| Dialog names the project and its chat count | 9 |
| `useProjectStore` separate from `useChatStore` | 8 |
| Sidebar projects section | 9 |
| Composer swap at the cap | 10 |
| "+ New chat" becomes "+ New project" when full | 9 |
| Coverage stays at 80% | 11 |

Deferred to plan 2 by design: `Chat.summary`, `lib/summary/`, `systemInstruction` routing, and clearing the summary on edit.

**Type consistency:** `ProjectSummary` is `{ id, name, chatCount, updatedAt }` in Tasks 6, 8, 9. `ChatSummary` gains `projectId` and `messageCount` in Task 6 and is used with both in Tasks 9 and 10. Store actions are `addProject` / `renameProject` / `removeProject` throughout Tasks 8 and 10 — note the store's `removeProject` deliberately differs from the api module's `deleteProject` so the two aren't confused at call sites.

**Known follow-ups not in scope:** the code review's `trust proxy` finding (two proxies, one rate-limit bucket) and the unthrottled `POST /chats` are untouched here. `POST /chats` now costs strictly more per call, so throttling it is worth its own task soon.
