import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { GodotBridge } from "./godot-bridge.js";
import { getOrCreateUserToken } from "./user-token.js";
import { registerEditorTools } from "./tools/editor.js";
import { RuntimeManager, registerRuntimeTools } from "./tools/runtime.js";

async function main(): Promise<void> {
  const token = getOrCreateUserToken();
  const bridge = new GodotBridge({
    host: "127.0.0.1",
    port: 8765,
    token
  });
  const runtime = new RuntimeManager();
  const server = new McpServer({ name: "godot-editor-mcp", version: "0.1.0" });

  registerEditorTools(server, bridge);
  registerRuntimeTools(server, bridge, runtime);
  await server.connect(new StdioServerTransport());
}

main().catch((error) => {
  console.error(error instanceof Error ? error.stack ?? error.message : String(error));
  process.exitCode = 1;
});
