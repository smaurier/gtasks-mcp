import { describe, it, expect, vi } from "vitest";
import { normalizeDueDate, formatTask, TaskActions, type ToolTextResult } from "../src/tasks.js";
import type { tasks_v1 } from "googleapis";

// Every tool in this codebase only ever returns text blocks (see textResult()
// in tasks.ts) — this narrows the SDK's text/image/audio/resource union for
// tests, rather than sprinkling non-null-and-narrow assertions at every call site.
function text(result: ToolTextResult): string {
  const first = result.content[0];
  if (!first || first.type !== "text") throw new Error("expected a text content block");
  return first.text;
}

describe("normalizeDueDate", () => {
  it("returns undefined for an undefined input", () => {
    expect(normalizeDueDate(undefined)).toBeUndefined();
  });

  it("normalizes a bare date to midnight UTC RFC 3339", () => {
    expect(normalizeDueDate("2025-03-19")).toBe("2025-03-19T00:00:00.000Z");
  });

  it("normalizes an ISO datetime by dropping the time portion (Google Tasks stores date only)", () => {
    expect(normalizeDueDate("2025-03-19T21:00:00Z")).toBe("2025-03-19T00:00:00.000Z");
  });

  it("throws a clear error on an unparseable date rather than silently sending garbage to the API", () => {
    expect(() => normalizeDueDate("pas une date")).toThrow(/Invalid due date/);
  });
});

describe("formatTask", () => {
  it("includes the title and status in the formatted line", () => {
    const task: tasks_v1.Schema$Task = { id: "1", title: "Signer le contrat", status: "needsAction" };
    const out = formatTask(task);
    expect(out).toContain("Signer le contrat");
    expect(out).toContain("needsAction");
  });

  it("shows 'Not set' for a missing due date rather than 'undefined'", () => {
    const task: tasks_v1.Schema$Task = { id: "1", title: "x" };
    expect(formatTask(task)).toContain("Not set");
    expect(formatTask(task)).not.toContain("undefined");
  });
});

// Fake tasks_v1.Tasks client — same "no mocking of things we don't own the boundary
// of, but no real network calls in unit tests either" bias as claude-synapse: a
// hand-rolled fake matching just the surface these functions actually call.
function fakeTasksClient(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    tasklists: {
      list: vi.fn().mockResolvedValue({ data: { items: [{ id: "list1", title: "My Tasks" }] } }),
    },
    tasks: {
      list: vi.fn().mockResolvedValue({ data: { items: [] } }),
      insert: vi.fn().mockResolvedValue({ data: { title: "created" } }),
      patch: vi.fn().mockResolvedValue({ data: { title: "updated" } }),
      delete: vi.fn().mockResolvedValue({}),
      clear: vi.fn().mockResolvedValue({}),
      ...overrides,
    },
  } as unknown as tasks_v1.Tasks;
}

describe("TaskActions.create", () => {
  it("requires a title", async () => {
    const client = fakeTasksClient();
    await expect(TaskActions.create({ title: undefined }, client)).rejects.toThrow(/title is required/i);
  });

  it("defaults to the @default task list when none is given", async () => {
    const client = fakeTasksClient();
    await TaskActions.create({ title: "x" }, client);
    expect(client.tasks.insert).toHaveBeenCalledWith(
      expect.objectContaining({ tasklist: "@default" }),
    );
  });

  it("normalizes the due date before sending it", async () => {
    const client = fakeTasksClient();
    await TaskActions.create({ title: "x", due: "2025-03-19" }, client);
    expect(client.tasks.insert).toHaveBeenCalledWith(
      expect.objectContaining({ requestBody: expect.objectContaining({ due: "2025-03-19T00:00:00.000Z" }) }),
    );
  });
});

describe("TaskActions.search", () => {
  it("filters by title or notes, case-insensitively", async () => {
    const client = fakeTasksClient({
      list: vi.fn().mockResolvedValue({
        data: {
          items: [
            { id: "1", title: "Signer le contrat garde", status: "needsAction" },
            { id: "2", title: "Autre chose", notes: "rien à voir", status: "needsAction" },
          ],
        },
      }),
    });
    const result = await TaskActions.search({ query: "CONTRAT" }, client);
    expect(text(result)).toContain("Signer le contrat garde");
    expect(text(result)).not.toContain("Autre chose");
  });
});

describe("TaskActions.delete", () => {
  it("requires a task id", async () => {
    const client = fakeTasksClient();
    await expect(TaskActions.delete({ id: undefined }, client)).rejects.toThrow(/id is required/i);
  });
});
