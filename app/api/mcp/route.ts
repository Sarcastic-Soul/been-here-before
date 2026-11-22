import { handleBody } from "@/lib/mcp/rpc";

/**
 * POST /api/mcp. MCP over Streamable HTTP, JSON replies only, no sessions.
 * Reads only from the database or saved copies, never from CMC.
 */
export async function POST(request: Request) {
  const reply = await handleBody(await request.text());
  if (reply.body === undefined)
    return new Response(null, { status: reply.status });
  return Response.json(reply.body, { status: reply.status });
}

/** This server never opens an SSE stream, so GET is not allowed. */
export function GET() {
  return new Response(null, { status: 405, headers: { Allow: "POST" } });
}
