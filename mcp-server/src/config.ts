import { readFileSync } from "node:fs";
import { isAbsolute, normalize, relative, resolve } from "node:path";
import { z } from "zod";

const configSchema = z.object({
  host: z.string(),
  port: z.number().int(),
  projectRoot: z.string(),
  tokenPath: z.string()
});

export type McpConfig = {
  host: "127.0.0.1";
  port: number;
  projectRoot: string;
  tokenPath: string;
};

function resolveWithinProject(projectRoot: string, candidate: string): string {
  const resolved = normalize(isAbsolute(candidate) ? candidate : resolve(projectRoot, candidate));
  const outsideProject = relative(projectRoot, resolved).startsWith("..");
  if (outsideProject) {
    throw new Error("Path must remain inside project root: " + candidate);
  }
  return resolved;
}

export function loadConfig(projectRoot: string): McpConfig {
  const root = resolve(projectRoot);
  const raw = JSON.parse(readFileSync(resolve(root, ".godot-mcp.json"), "utf8"));
  const parsed = configSchema.parse(raw);

  if (parsed.host !== "127.0.0.1") {
    throw new Error("Godot MCP bridge must bind to 127.0.0.1");
  }
  if (parsed.port < 1024 || parsed.port > 65535) {
    throw new Error("Godot MCP bridge port must be between 1024 and 65535");
  }

  return {
    host: "127.0.0.1",
    port: parsed.port,
    projectRoot: resolveWithinProject(root, parsed.projectRoot),
    tokenPath: resolveWithinProject(root, parsed.tokenPath)
  };
}
