import { NextResponse } from "next/server";
import { currentBusinessId } from "@/lib/session";
import * as memory from "@/lib/resources/memory";
import * as audience from "@/lib/resources/audience";
import * as content from "@/lib/resources/content";
import * as agentStore from "@/lib/resources/agent";

/**
 * Model Context Protocol (MCP) Server Endpoint.
 *
 * Implements the standard MCP JSON-RPC 2.0 specification so external clients
 * (Cursor, Claude Desktop, Slack agents) can inspect resources and invoke Pulse
 * tools directly over HTTP.
 */

interface JsonRpcRequest {
  jsonrpc: "2.0";
  id?: string | number;
  method: string;
  params?: Record<string, unknown>;
}

export async function POST(req: Request) {
  try {
    const body = (await req.json()) as JsonRpcRequest;
    const { method, params, id = 1 } = body ?? {};
    const bizId = currentBusinessId();

    if (!method) {
      return NextResponse.json(
        { jsonrpc: "2.0", id, error: { code: -32600, message: "Invalid Request" } },
        { status: 400 }
      );
    }

    switch (method) {
      case "initialize":
        return NextResponse.json({
          jsonrpc: "2.0",
          id,
          result: {
            protocolVersion: "2024-11-05",
            capabilities: {
              tools: {},
              resources: {},
            },
            serverInfo: {
              name: "pulse-mcp-server",
              version: "0.1.0",
            },
          },
        });

      case "tools/list":
        return NextResponse.json({
          jsonrpc: "2.0",
          id,
          result: {
            tools: [
              {
                name: "memory_search",
                description: "Search long-term company memory (brand voice, positioning, personas)",
                inputSchema: {
                  type: "object",
                  properties: { query: { type: "string" }, tag: { type: "string" } },
                  required: ["query"],
                },
              },
              {
                name: "draft_content",
                description: "Draft an email, blog post, or social media item",
                inputSchema: {
                  type: "object",
                  properties: {
                    kind: { type: "string", enum: ["email", "social", "blog"] },
                    title: { type: "string" },
                    body: { type: "string" },
                  },
                  required: ["kind", "title", "body"],
                },
              },
              {
                name: "publish_content",
                description: "Publish or dispatch content item",
                inputSchema: {
                  type: "object",
                  properties: { contentId: { type: "string" } },
                  required: ["contentId"],
                },
              },
              {
                name: "list_audience_lists",
                description: "List target subscriber lists",
                inputSchema: { type: "object", properties: {} },
              },
            ],
          },
        });

      case "tools/call": {
        const toolName = params?.name as string;
        const args = (params?.arguments ?? {}) as Record<string, unknown>;

        if (toolName === "memory_search") {
          const query = String(args.query ?? "");
          const tag = args.tag ? String(args.tag) : undefined;
          const hits = memory.searchMemories(bizId, query, { tag });
          return NextResponse.json({
            jsonrpc: "2.0",
            id,
            result: {
              content: [
                {
                  type: "text",
                  text: JSON.stringify({ count: hits.length, results: hits }),
                },
              ],
            },
          });
        }

        if (toolName === "draft_content") {
          const item = content.createDraft(bizId, {
            kind: args.kind as "email" | "social" | "blog",
            title: String(args.title ?? ""),
            body: String(args.body ?? ""),
            meta: {},
          });
          return NextResponse.json({
            jsonrpc: "2.0",
            id,
            result: {
              content: [{ type: "text", text: JSON.stringify(item) }],
            },
          });
        }

        if (toolName === "publish_content") {
          const item = content.publishContent(bizId, String(args.contentId));
          return NextResponse.json({
            jsonrpc: "2.0",
            id,
            result: {
              content: [{ type: "text", text: JSON.stringify(item) }],
            },
          });
        }

        if (toolName === "list_audience_lists") {
          const lists = audience.listLists(bizId);
          return NextResponse.json({
            jsonrpc: "2.0",
            id,
            result: {
              content: [{ type: "text", text: JSON.stringify(lists) }],
            },
          });
        }

        return NextResponse.json(
          { jsonrpc: "2.0", id, error: { code: -32601, message: `Method or tool '${toolName}' not found` } },
          { status: 404 }
        );
      }

      case "resources/list": {
        const mems = memory.listMemories(bizId);
        return NextResponse.json({
          jsonrpc: "2.0",
          id,
          result: {
            resources: mems.map((m) => ({
              uri: `pulse://memory${m.path}`,
              name: m.title,
              mimeType: "text/markdown",
            })),
          },
        });
      }

      default:
        return NextResponse.json(
          { jsonrpc: "2.0", id, error: { code: -32601, message: "Method not found" } },
          { status: 404 }
        );
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : "Internal error";
    return NextResponse.json(
      { jsonrpc: "2.0", id: 1, error: { code: -32603, message } },
      { status: 500 }
    );
  }
}
