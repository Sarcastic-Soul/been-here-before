import "server-only";

import { z } from "zod";

import { TOOLS, type ToolResult } from "./tools";

export const PROTOCOL_VERSION = "2025-06-18";

export const SERVER_INFO = { name: "been-here-before", version: "1.0.0" };

export const PARSE_ERROR = -32700;
export const INVALID_REQUEST = -32600;
export const METHOD_NOT_FOUND = -32601;
export const INVALID_PARAMS = -32602;
export const INTERNAL_ERROR = -32603;

type Id = string | number | null;

/** What the route sends back: an HTTP status and, unless it is empty, a JSON body. */
export interface RpcReply {
  status: number;
  body?: Record<string, unknown>;
}

function failure(
  id: Id,
  code: number,
  message: string,
  status = 200,
): RpcReply {
  return {
    status,
    body: { jsonrpc: "2.0", id, error: { code, message } },
  };
}

function success(id: Id, result: unknown): RpcReply {
  return { status: 200, body: { jsonrpc: "2.0", id, result } };
}

const Message = z.object({
  jsonrpc: z.literal("2.0"),
  id: z.union([z.string(), z.number()]).optional(),
  method: z.string().optional(),
  params: z.unknown().optional(),
});

const CallParams = z.object({
  name: z.string(),
  arguments: z.record(z.string(), z.unknown()).optional(),
});

async function callTool(id: Id, params: unknown): Promise<RpcReply> {
  const parsed = CallParams.safeParse(params);
  if (!parsed.success) {
    return failure(id, INVALID_PARAMS, "tools/call needs a tool name");
  }
  const tool = TOOLS.find((t) => t.name === parsed.data.name);
  if (!tool) {
    return failure(id, INVALID_PARAMS, `Unknown tool: ${parsed.data.name}`);
  }
  const args = tool.args.safeParse(parsed.data.arguments ?? {});
  if (!args.success) {
    const detail = args.error.issues.map((i) => i.message).join("; ");
    return failure(id, INVALID_PARAMS, `Invalid arguments: ${detail}`);
  }
  let result: ToolResult;
  try {
    result = await tool.run(args.data as never);
  } catch (error) {
    console.error(`mcp tool ${tool.name} threw`, error);
    result = {
      content: [{ type: "text", text: "The tool failed. Try again later." }],
      isError: true,
    };
  }
  return success(id, result);
}

/** Handles one JSON-RPC message that is already parsed from the request body. */
export async function handleMessage(raw: unknown): Promise<RpcReply> {
  if (Array.isArray(raw)) {
    return failure(
      null,
      INVALID_REQUEST,
      "Batches are not supported. Send one request per call.",
      400,
    );
  }
  const message = Message.safeParse(raw);
  if (!message.success) {
    return failure(null, INVALID_REQUEST, "Not a JSON-RPC 2.0 message", 400);
  }
  const { id, method, params } = message.data;

  // A response from the client (no method), or a notification (no id).
  if (method === undefined) {
    if (id === undefined) {
      return failure(null, INVALID_REQUEST, "Missing method", 400);
    }
    return { status: 202 };
  }
  if (id === undefined) return { status: 202 };

  switch (method) {
    case "initialize":
      return success(id, {
        protocolVersion: PROTOCOL_VERSION,
        serverInfo: SERVER_INFO,
        capabilities: { tools: {} },
        instructions:
          "Look up a coin with base_rate. Results are historical base rates, not forecasts or financial advice.",
      });
    case "ping":
      return success(id, {});
    case "tools/list":
      return success(id, {
        tools: TOOLS.map(({ name, description, inputSchema }) => ({
          name,
          description,
          inputSchema,
        })),
      });
    case "tools/call":
      return callTool(id, params);
    default:
      return failure(id, METHOD_NOT_FOUND, `Method not found: ${method}`);
  }
}

/** Handles the raw text of a POST body. */
export async function handleBody(text: string): Promise<RpcReply> {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    return failure(
      null,
      PARSE_ERROR,
      "Parse error: body is not valid JSON",
      400,
    );
  }
  try {
    return await handleMessage(raw);
  } catch (error) {
    console.error("mcp handler failed", error);
    return failure(null, INTERNAL_ERROR, "Internal error", 500);
  }
}
