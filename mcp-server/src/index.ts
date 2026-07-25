import { existsSync, readFileSync } from "node:fs";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { GodotBridge } from "./godot-bridge.js";
import { loadConfig } from "./config.js";
import { registerEditorTools } from "./tools/editor.js";
import { RuntimeManager, registerRuntimeTools } from "./tools/runtime.js";

function readToken(path: string): string {
  return existsSync(path) ? readFileSync(path, "utf8").replace(/^\uFEFF/, "").trim() : "";
}

async function main(): Promise<void> {
  const projectRoot = process.env.GODOT_PROJECT_ROOT ?? process.cwd();
  const config = loadConfig(projectRoot);
  const bridge = new GodotBridge({
    host: config.host,
    port: config.port,
    token: () => readToken(config.tokenPath)
  });
  const runtime = new RuntimeManager();
  const server = new McpServer({ name: "godot-editor-mcp", version: "0.1.0" });

  registerEditorTools(server, bridge);
  registerRuntimeTools(server, bridge, runtime, config.projectRoot);
  await server.connect(new StdioServerTransport());
}

main().catch((error) => {
  console.error(error instanceof Error ? error.stack ?? error.message : String(error));
  process.exitCode = 1;
});
