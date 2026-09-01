#!/usr/bin/env node
import { authenticate } from "@google-cloud/local-auth";
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { CallToolRequestSchema, ListToolsRequestSchema } from "@modelcontextprotocol/sdk/types.js";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { google } from "googleapis";
import { buildAuthClient, type OAuthKeyfile } from "./auth.js";
import { CONFIG_DIR, credentialsPath, oauthKeysPath } from "./config.js";
import { TaskActions } from "./tasks.js";

const tasks = google.tasks("v1");

const server = new Server(
  { name: "gtasks-mcp", version: "0.1.0" },
  { capabilities: { tools: {} } },
);

const TOOLS = [
  {
    name: "search",
    description: "Search for a task in Google Tasks by title or notes",
    inputSchema: {
      type: "object",
      properties: {
        query: { type: "string", description: "Search query" },
        taskListId: { type: "string", description: "Restrict search to one task list (default: all lists)" },
      },
      required: ["query"],
    },
  },
  {
    name: "list",
    description: "List tasks in Google Tasks",
    inputSchema: {
      type: "object",
      properties: {
        taskListId: { type: "string", description: "Task list ID (default: all lists)" },
      },
    },
  },
  {
    name: "list-tasklists",
    description: "List all task lists in Google Tasks",
    inputSchema: { type: "object", properties: {} },
  },
  {
    name: "create",
    description: "Create a new task in Google Tasks",
    inputSchema: {
      type: "object",
      properties: {
        taskListId: { type: "string", description: "Task list ID (default: @default)" },
        title: { type: "string", description: "Task title" },
        notes: { type: "string", description: "Task notes" },
        due: { type: "string", description: "Due date (YYYY-MM-DD or ISO 8601)" },
      },
      required: ["title"],
    },
  },
  {
    name: "update",
    description: "Update a task in Google Tasks",
    inputSchema: {
      type: "object",
      properties: {
        taskListId: { type: "string", description: "Task list ID (default: @default)" },
        id: { type: "string", description: "Task ID" },
        title: { type: "string", description: "Task title" },
        notes: { type: "string", description: "Task notes" },
        status: { type: "string", enum: ["needsAction", "completed"], description: "Task status" },
        due: { type: "string", description: "Due date (YYYY-MM-DD or ISO 8601)" },
      },
      required: ["id"],
    },
  },
  {
    name: "delete",
    description: "Delete a task in Google Tasks",
    inputSchema: {
      type: "object",
      properties: {
        taskListId: { type: "string", description: "Task list ID (default: @default)" },
        id: { type: "string", description: "Task ID" },
      },
      required: ["id"],
    },
  },
  {
    name: "clear",
    description: "Clear completed tasks from a Google Tasks task list",
    inputSchema: {
      type: "object",
      properties: {
        taskListId: { type: "string", description: "Task list ID (default: @default)" },
      },
    },
  },
] as const;

server.setRequestHandler(ListToolsRequestSchema, async () => ({ tools: TOOLS }));

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const args = (request.params.arguments ?? {}) as Record<string, unknown>;
  switch (request.params.name) {
    case "search":
      return TaskActions.search({ query: args.query as string, taskListId: args.taskListId as string | undefined }, tasks);
    case "list":
      return TaskActions.list({ taskListId: args.taskListId as string | undefined }, tasks);
    case "list-tasklists":
      return TaskActions.listTaskLists({}, tasks);
    case "create":
      return TaskActions.create(
        { title: args.title as string | undefined, taskListId: args.taskListId as string | undefined, notes: args.notes as string | undefined, due: args.due as string | undefined },
        tasks,
      );
    case "update":
      return TaskActions.update(
        {
          id: args.id as string | undefined,
          taskListId: args.taskListId as string | undefined,
          title: args.title as string | undefined,
          notes: args.notes as string | undefined,
          status: args.status as string | undefined,
          due: args.due as string | undefined,
        },
        tasks,
      );
    case "delete":
      return TaskActions.delete({ id: args.id as string | undefined, taskListId: args.taskListId as string | undefined }, tasks);
    case "clear":
      return TaskActions.clear({ taskListId: args.taskListId as string | undefined }, tasks);
    default:
      throw new Error(`Tool not found: ${request.params.name}`);
  }
});

async function authenticateAndSaveCredentials(): Promise<void> {
  if (!existsSync(oauthKeysPath)) {
    console.error(
      `OAuth client file not found at ${oauthKeysPath}.\n` +
        "Download it from Google Cloud Console (APIs & Services > Credentials > your Desktop app OAuth client) and place it there first. See README.",
    );
    process.exitCode = 1;
    return;
  }
  console.log("Launching auth flow in your browser...");
  const auth = await authenticate({
    keyfilePath: oauthKeysPath,
    scopes: ["https://www.googleapis.com/auth/tasks"],
  });
  mkdirSync(CONFIG_DIR, { recursive: true });
  writeFileSync(credentialsPath, JSON.stringify(auth.credentials));
  console.log(`Credentials saved to ${credentialsPath}. You can now run the server.`);
}

async function loadCredentialsAndRunServer(): Promise<void> {
  if (!existsSync(credentialsPath)) {
    console.error(`Credentials not found at ${credentialsPath}. Run 'npm run auth' first.`);
    process.exitCode = 1;
    return;
  }
  if (!existsSync(oauthKeysPath)) {
    console.error(`OAuth client file not found at ${oauthKeysPath}. See README.`);
    process.exitCode = 1;
    return;
  }
  const credentials = JSON.parse(readFileSync(credentialsPath, "utf-8")) as Record<string, unknown>;
  const oauthKeys = JSON.parse(readFileSync(oauthKeysPath, "utf-8")) as OAuthKeyfile;
  google.options({ auth: buildAuthClient(oauthKeys, credentials) });

  const transport = new StdioServerTransport();
  await server.connect(transport);
}

async function main(): Promise<void> {
  if (process.argv[2] === "auth") {
    await authenticateAndSaveCredentials();
  } else {
    await loadCredentialsAndRunServer();
  }
}

void main().catch((err: unknown) => {
  console.error(err);
  process.exitCode = 1;
});
