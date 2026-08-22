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
