/**
 * Core Google Tasks logic, deliberately decoupled from the MCP request/response
 * shape (unlike the reference this was adapted from, where every function took
 * a full CallToolRequest) — these take plain argument objects, so unit tests
 * don't need to construct fake MCP protocol envelopes to exercise them.
 */
import type { tasks_v1 } from "googleapis";
import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";

const MAX_TASK_RESULTS = 100;

/** Alias kept for readability at call sites; same type the MCP SDK itself
 *  expects a tool call handler to return (imported, not hand-rolled) — an
 *  earlier hand-rolled version of this type structurally matched the wrong
 *  arm of the SDK's broader result union and produced a confusing type
 *  error naming an unrelated "task" field from a totally different, async
 *  polling response shape. */
export type ToolTextResult = CallToolResult;

function textResult(text: string): ToolTextResult {
  return { content: [{ type: "text", text }], isError: false };
}

/**
 * Normalize a due date string to the RFC 3339 format Google Tasks expects.
 * Google Tasks only stores the date portion, so time is set to midnight UTC.
 * Accepts "2025-03-19", "2025-03-19T21:00:00", "2025-03-19T21:00:00Z", etc.
 */
export function normalizeDueDate(due: string | undefined): string | undefined {
  if (!due) return undefined;
  const parsed = new Date(due);
  if (isNaN(parsed.getTime())) {
    throw new Error(`Invalid due date format: "${due}". Use YYYY-MM-DD or ISO 8601 format.`);
  }
  const year = parsed.getUTCFullYear();
  const month = String(parsed.getUTCMonth() + 1).padStart(2, "0");
  const day = String(parsed.getUTCDate()).padStart(2, "0");
  return `${year}-${month}-${day}T00:00:00.000Z`;
}

export function formatTask(task: tasks_v1.Schema$Task): string {
  return `${task.title} (Due: ${task.due ?? "Not set"}) - Notes: ${task.notes ?? "None"} - ID: ${task.id} - Status: ${task.status ?? "Unknown"} - List item ID: ${task.id}`;
}

function formatTaskList(taskList: tasks_v1.Schema$Task[]): string {
  return taskList.map(formatTask).join("\n");
}

async function listAllTasks(tasks: tasks_v1.Tasks, taskListId?: string): Promise<tasks_v1.Schema$Task[]> {
  if (taskListId) {
    const response = await tasks.tasks.list({ tasklist: taskListId, maxResults: MAX_TASK_RESULTS });
    return response.data.items ?? [];
  }
  const taskListsResponse = await tasks.tasklists.list({ maxResults: MAX_TASK_RESULTS });
  const taskLists = taskListsResponse.data.items ?? [];
  let all: tasks_v1.Schema$Task[] = [];
  for (const list of taskLists) {
    if (!list.id) continue;
    const response = await tasks.tasks.list({ tasklist: list.id, maxResults: MAX_TASK_RESULTS });
    all = all.concat(response.data.items ?? []);
  }
  return all;
}

export interface CreateArgs {
  taskListId?: string | undefined;
  title: string | undefined;
  notes?: string | undefined;
  due?: string | undefined;
}

export interface UpdateArgs {
  taskListId?: string | undefined;
  id: string | undefined;
  title?: string | undefined;
  notes?: string | undefined;
  status?: string | undefined;
  due?: string | undefined;
}

export interface DeleteArgs {
  taskListId?: string | undefined;
  id: string | undefined;
}

export interface SearchArgs {
  query: string;
  taskListId?: string | undefined;
}

export interface ListArgs {
  taskListId?: string | undefined;
}

export interface ClearArgs {
  taskListId?: string | undefined;
}

export const TaskActions = {
  async create(args: CreateArgs, tasks: tasks_v1.Tasks): Promise<ToolTextResult> {
    if (!args.title) throw new Error("Task title is required");
    const taskListId = args.taskListId ?? "@default";
    const body: Record<string, string> = { title: args.title };
    if (args.notes) body.notes = args.notes;
    const due = normalizeDueDate(args.due);
    if (due) body.due = due;

    const response = await tasks.tasks.insert({ tasklist: taskListId, requestBody: body });
    return textResult(`Task created: ${response.data.title}`);
  },

  async update(args: UpdateArgs, tasks: tasks_v1.Tasks): Promise<ToolTextResult> {
    if (!args.id) throw new Error("Task id is required");
    const taskListId = args.taskListId ?? "@default";
    const body: Record<string, string> = {};
    if (args.title) body.title = args.title;
    if (args.notes) body.notes = args.notes;
    if (args.status) body.status = args.status;
    const due = normalizeDueDate(args.due);
    if (due) body.due = due;

    const response = await tasks.tasks.patch({ tasklist: taskListId, task: args.id, requestBody: body });
    return textResult(`Task updated: ${response.data.title}`);
  },

  async delete(args: DeleteArgs, tasks: tasks_v1.Tasks): Promise<ToolTextResult> {
    if (!args.id) throw new Error("Task id is required");
    const taskListId = args.taskListId ?? "@default";
    await tasks.tasks.delete({ tasklist: taskListId, task: args.id });
    return textResult(`Task ${args.id} deleted`);
  },

  async list(args: ListArgs, tasks: tasks_v1.Tasks): Promise<ToolTextResult> {
    const all = await listAllTasks(tasks, args.taskListId);
    return textResult(`Found ${all.length} tasks:\n${formatTaskList(all)}`);
  },

  async search(args: SearchArgs, tasks: tasks_v1.Tasks): Promise<ToolTextResult> {
    const all = await listAllTasks(tasks, args.taskListId);
    const needle = args.query.toLowerCase();
    const filtered = all.filter(
      (task) => task.title?.toLowerCase().includes(needle) || task.notes?.toLowerCase().includes(needle),
    );
    return textResult(`Found ${filtered.length} tasks:\n${formatTaskList(filtered)}`);
  },

  async clear(args: ClearArgs, tasks: tasks_v1.Tasks): Promise<ToolTextResult> {
    const taskListId = args.taskListId ?? "@default";
    await tasks.tasks.clear({ tasklist: taskListId });
    return textResult(`Completed tasks cleared from list ${taskListId}`);
  },

  async listTaskLists(_args: Record<string, never>, tasks: tasks_v1.Tasks): Promise<ToolTextResult> {
    const response = await tasks.tasklists.list();
    const lists = response.data.items ?? [];
    if (lists.length === 0) return textResult("No task lists found");
    const formatted = lists.map((list) => `${list.title} (ID: ${list.id})`).join("\n");
    return textResult(`Found ${lists.length} task lists:\n${formatted}`);
  },
};
