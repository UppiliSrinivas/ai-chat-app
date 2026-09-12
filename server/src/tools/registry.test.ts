import { describe, expect, it } from "vitest";
import { findTool, toolDeclarations } from "./registry.js";

describe("toolDeclarations", () => {
  it("offers every registered tool", () => {
    expect(toolDeclarations.map((tool) => tool.name).sort()).toEqual(["getWeather", "searchMyChats"]);
  });

  it("offers getWeather with plain JSON Schema parameters", () => {
    const weather = toolDeclarations.find((tool) => tool.name === "getWeather");

    expect(weather).toBeDefined();
    expect(weather?.parameters).toMatchObject({ type: "object", required: ["place"] });
  });
});

describe("findTool", () => {
  it("finds a registered tool by the name the model sends", () => {
    expect(findTool("getWeather")).toBeDefined();
    expect(findTool("searchMyChats")).toBeDefined();
  });

  it("returns undefined for a name nothing is registered under", () => {
    expect(findTool("getStockPrice")).toBeUndefined();
  });

  // FunctionCall.name is optional in the SDK, so this case is reachable.
  it("returns undefined when the model sent no name at all", () => {
    expect(findTool(undefined)).toBeUndefined();
  });
});

describe("the searchMyChats entry", () => {
  const search = findTool("searchMyChats")!;

  it("labels a call using the query the model supplied", () => {
    expect(search.describe({ query: "kubernetes" })).toBe('Searching your chats for "kubernetes"');
  });

  // Rejected before any database call, so this needs no connection.
  it("turns a missing query into a rejected search rather than a crash", async () => {
    const context = { userId: "user-1", signal: new AbortController().signal };

    await expect(search.run({}, context)).resolves.toMatchObject({ ok: false, code: "QUERY_TOO_SHORT" });
  });
});

describe("the getWeather entry", () => {
  const weather = findTool("getWeather")!;

  it("labels a call using the place the model supplied", () => {
    expect(weather.describe({ place: "Chennai" })).toBe("Checking the weather in Chennai");
  });

  // The model sends untyped JSON, so a wrong or missing argument must not throw.
  it("labels a call whose arguments are missing or the wrong type", () => {
    expect(weather.describe({})).toBe("Checking the weather");
    expect(weather.describe({ place: 42 })).toBe("Checking the weather");
  });

  it("turns a missing place into a rejected lookup rather than a crash", async () => {
    const context = { userId: "user-1", signal: new AbortController().signal };

    await expect(weather.run({}, context)).resolves.toEqual({
      ok: false,
      code: "PLACE_NOT_FOUND",
      message: "No place was given to look up.",
    });
  });
});
