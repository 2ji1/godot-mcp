import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import type { GodotBridge } from "../godot-bridge.js";
import { parseSceneTreeArgs } from "./scene.js";
import { parseCreateNodeArgs, parseDeleteNodeArgs, parseSetPropertyArgs } from "./mutations.js";

function asObject(value: unknown): Record<string, unknown> {
  return value !== null && typeof value === "object" ? value as Record<string, unknown> : { value };
}

export async function callBridge(bridge: GodotBridge, method: string, params: Record<string, unknown>) {
  try {
    const result = await bridge.request(method, params);
    const structuredContent = asObject(result);
    return {
      content: [{ type: "text" as const, text: JSON.stringify(structuredContent, null, 2) }],
      structuredContent
    };
  } catch (error) {
    const code = error instanceof Error && "code" in error ? String(error.code) : "BRIDGE_ERROR";
    const message = error instanceof Error ? error.message : String(error);
    return {
      isError: true,
      content: [{ type: "text" as const, text: `${code}: ${message}` }]
    };
  }
}

export function registerEditorTools(server: McpServer, bridge: GodotBridge): void {
  server.registerTool(
    "godot_editor_status",
    {
      title: "Godot Editor Status",
      description: "Read the connected Godot editor and active scene status"
    },
    async () => callBridge(bridge, "editor.status", {})
  );

  server.registerTool(
    "godot_current_scene",
    {
      title: "Godot Current Scene",
      description: "Read the currently edited Godot scene"
    },
    async () => callBridge(bridge, "editor.current_scene", {})
  );

  server.registerTool(
    "godot_scene_tree",
    {
      title: "Godot Scene Tree",
      description: "Read the active Godot scene tree up to a bounded depth",
      inputSchema: {
        maxDepth: z.number().int().min(0).default(8)
      }
    },
    async (input) => callBridge(bridge, "scene.get_tree", parseSceneTreeArgs(input))
  );

  server.registerTool(
    "godot_create_node",
    {
      title: "Godot Create Node",
      description: "Create an undoable child node in the active scene",
      inputSchema: {
        parentPath: z.string().min(1).max(512).default("."),
        type: z.string().regex(/^[A-Z][A-Za-z0-9_]*$/),
        name: z.string().regex(/^[A-Za-z_][A-Za-z0-9_]*$/)
      }
    },
    async (input) => callBridge(bridge, "scene.create_node", parseCreateNodeArgs(input))
  );

  server.registerTool(
    "godot_set_property",
    {
      title: "Godot Set Property",
      description: "Set an undoable property on a node in the active scene",
      inputSchema: {
        nodePath: z.string().min(1).max(512),
        property: z.string().regex(/^[A-Za-z_][A-Za-z0-9_]*$/),
        value: z.unknown()
      }
    },
    async (input) => callBridge(bridge, "scene.set_property", parseSetPropertyArgs(input))
  );

  server.registerTool(
    "godot_delete_node",
    {
      title: "Godot Delete Node",
      description: "Delete an active-scene node after explicit confirmation",
      inputSchema: {
        nodePath: z.string().min(1).max(512),
        confirm: z.literal(true)
      }
    },
    async (input) => callBridge(bridge, "scene.delete_node", parseDeleteNodeArgs(input))
  );
}
