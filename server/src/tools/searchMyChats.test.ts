import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { describeSearchMyChatsCall, searchMyChats } from "./searchMyChats.js";

/** Mocked rather than connected: what matters here is the filter the tool
 *  builds, which is exactly what a live database would hide. */
const { findMock } = vi.hoisted(() => ({ findMock: vi.fn() }));
vi.mock("../models/Chat.js", () => ({ Chat: { find: findMock } }));

const storedChat = (overrides: Record<string, unknown> = {}) => ({
  _id: { toString: () => "chat-1" },
  title: "Kubernetes setup",
  updatedAt: new Date("2026-09-01T10:00:00.000Z"),
  summary: { text: "Talked about scaling clusters." },
  messages: [{ content: "Earlier chatter. How do I scale a kubernetes deployment safely?" }],
  ...overrides,
});

const stubChats = (docs: unknown[]) => {
  const lean = vi.fn(async () => docs);
  const limit = vi.fn(() => ({ lean }));
  const sort = vi.fn(() => ({ limit }));
  findMock.mockReturnValue({ sort });
  return { sort, limit, lean };
};

const filterUsed = () => findMock.mock.calls[0]![0] as Record<string, unknown>;

beforeEach(() => {
  findMock.mockReset();
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("searchMyChats", () => {
  // The whole point of the tool: another user's chat is never in the result set
  // to begin with, rather than fetched and then rejected.
  it("scopes every search to the caller", async () => {
    stubChats([]);

    await searchMyChats({ query: "kubernetes" }, "user-1");

    expect(filterUsed()).toMatchObject({ userId: "user-1" });
  });

  it("searches titles, message content and the summary", async () => {
    stubChats([]);

    await searchMyChats({ query: "kubernetes" }, "user-1");

    const or = filterUsed().$or as Record<string, unknown>[];
    expect(or.map((clause) => Object.keys(clause)[0])).toEqual(["title", "messages.content", "summary.text"]);
  });

  it("reports the chat, its title and when it was last touched", async () => {
    stubChats([storedChat()]);

    const result = await searchMyChats({ query: "kubernetes" }, "user-1");

    expect(result).toEqual({
      ok: true,
      matches: [
        {
          chatId: "chat-1",
          title: "Kubernetes setup",
          snippet: expect.stringContaining("kubernetes"),
          updatedAt: "2026-09-01T10:00:00.000Z",
        },
      ],
    });
  });

  it("takes the snippet from the message that matched, not the first one", async () => {
    stubChats([
      storedChat({
        messages: [{ content: "Nothing relevant here." }, { content: "Ask about kubernetes autoscaling." }],
      }),
    ]);

    const result = await searchMyChats({ query: "kubernetes" }, "user-1");

    expect(result.ok && result.matches[0]?.snippet).toContain("kubernetes autoscaling");
  });

  it("falls back to the summary when only the title matched", async () => {
    stubChats([storedChat({ messages: [] })]);

    const result = await searchMyChats({ query: "kubernetes" }, "user-1");

    expect(result.ok && result.matches[0]?.snippet).toBe("Talked about scaling clusters.");
  });

  it("falls back to the title when there is no message or summary", async () => {
    stubChats([storedChat({ messages: [], summary: undefined })]);

    const result = await searchMyChats({ query: "kubernetes" }, "user-1");

    expect(result.ok && result.matches[0]?.snippet).toBe("Kubernetes setup");
  });

  // ":(" would throw as a raw pattern and "(a+)+$" would pin a CPU, and both
  // arrive as ordinary things a person might type.
  it("treats a query with regex characters as literal text", async () => {
    stubChats([]);

    const result = await searchMyChats({ query: ":(" }, "user-1");

    expect(result).toEqual({ ok: true, matches: [] });
    const titleClause = (filterUsed().$or as { title: RegExp }[])[0]!;
    expect(titleClause.title.test(":(")).toBe(true);
    expect(titleClause.title.test("x")).toBe(false);
  });

  it("asks for more to go on rather than matching everything", async () => {
    stubChats([]);

    const result = await searchMyChats({ query: "a" }, "user-1");

    expect(result).toEqual({ ok: false, code: "QUERY_TOO_SHORT", message: expect.any(String) });
    expect(findMock).not.toHaveBeenCalled();
  });

  it("caps how many chats reach the model", async () => {
    const { limit, sort } = stubChats([]);

    await searchMyChats({ query: "kubernetes" }, "user-1");

    expect(sort).toHaveBeenCalledWith({ updatedAt: -1 });
    expect(limit).toHaveBeenCalledWith(5);
  });

  it("reports SEARCH_FAILED rather than throwing into the stream", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    const lean = vi.fn(async () => {
      throw new Error("mongo is down");
    });
    findMock.mockReturnValue({ sort: () => ({ limit: () => ({ lean }) }) });

    const result = await searchMyChats({ query: "kubernetes" }, "user-1");

    expect(result).toEqual({
      ok: false,
      code: "SEARCH_FAILED",
      message: "Your chats could not be searched right now.",
    });
  });
});

describe("describeSearchMyChatsCall", () => {
  it("quotes what is being searched for", () => {
    expect(describeSearchMyChatsCall({ query: "kubernetes" })).toBe('Searching your chats for "kubernetes"');
  });

  it("drops the quote when there is nothing to quote", () => {
    expect(describeSearchMyChatsCall({ query: "  " })).toBe("Searching your chats");
  });
});
