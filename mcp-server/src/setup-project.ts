import {
  cpSync,
  existsSync,
  mkdirSync,
  readFileSync,
  writeFileSync
} from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const MANAGED_BEGIN = "# BEGIN godot-mcp managed config";
const MANAGED_END = "# END godot-mcp managed config";
const GODOT_SECTION = /^\s*\[mcp_servers\.godot\]\s*$/m;

export type ProjectSetupOptions = {
  projectRoot: string;
  codexProjectRoot?: string;
  serverRoot: string;
  godotExecutable: string;
  force: boolean;
};

export type ProjectSetupResult = {
  projectRoot: string;
  addonPath: string;
  projectConfigPath: string;
  codexConfigPath: string;
};

function tomlString(value: string): string {
  return JSON.stringify(value);
}

function managedConfig(options: ProjectSetupOptions): string {
  const serverEntry = join(options.serverRoot, "mcp-server", "dist", "index.js");
  return [
    MANAGED_BEGIN,
    "[mcp_servers.godot]",
    'command = "node"',
    `args = [${tomlString(serverEntry)}]`,
    `env = { GODOT_PROJECT_ROOT = ${tomlString(options.projectRoot)}, GODOT_EXECUTABLE = ${tomlString(options.godotExecutable)} }`,
    "startup_timeout_sec = 10",
    "tool_timeout_sec = 60",
    MANAGED_END
  ].join("\n");
}

function updateCodexConfig(existing: string, block: string): string {
  const beginIndex = existing.indexOf(MANAGED_BEGIN);
  const endIndex = existing.indexOf(MANAGED_END);

  if ((beginIndex === -1) !== (endIndex === -1) || endIndex < beginIndex) {
    throw new Error("Existing .codex/config.toml has a malformed godot-mcp managed block");
  }

  if (beginIndex !== -1) {
    const managedEnd = endIndex + MANAGED_END.length;
    const outsideManagedBlock = existing.slice(0, beginIndex) + existing.slice(managedEnd);
    if (GODOT_SECTION.test(outsideManagedBlock)) {
      throw new Error("Existing .codex/config.toml contains an unmanaged [mcp_servers.godot] section");
    }
    return existing.slice(0, beginIndex) + block + existing.slice(managedEnd);
  }

  if (GODOT_SECTION.test(existing)) {
    throw new Error("Existing .codex/config.toml contains an unmanaged [mcp_servers.godot] section");
  }

  if (existing.trim().length === 0) {
    return block + "\n";
  }
  return existing.trimEnd() + "\n\n" + block + "\n";
}

function requirePath(path: string, description: string): void {
  if (!existsSync(path)) {
    throw new Error(`${description} does not exist: ${path}`);
  }
}

export function installProject(rawOptions: ProjectSetupOptions): ProjectSetupResult {
  const options: ProjectSetupOptions = {
    projectRoot: resolve(rawOptions.projectRoot),
    codexProjectRoot: resolve(rawOptions.codexProjectRoot ?? rawOptions.projectRoot),
    serverRoot: resolve(rawOptions.serverRoot),
    godotExecutable: resolve(rawOptions.godotExecutable),
    force: rawOptions.force
  };
  const sourceAddon = join(options.serverRoot, "addons", "godot_mcp");
  const sourceProjectConfig = join(options.serverRoot, ".godot-mcp.example.json");
  const serverEntry = join(options.serverRoot, "mcp-server", "dist", "index.js");
  const targetAddon = join(options.projectRoot, "addons", "godot_mcp");
  const targetProjectConfig = join(options.projectRoot, ".godot-mcp.json");
  const targetCodexConfig = join(options.codexProjectRoot!, ".codex", "config.toml");

  requirePath(join(options.projectRoot, "project.godot"), "Godot project file");
  requirePath(sourceAddon, "Godot MCP addon source");
  requirePath(sourceProjectConfig, "Godot MCP project config template");
  requirePath(serverEntry, "Built MCP server entrypoint");
  requirePath(options.godotExecutable, "Godot executable");

  if (existsSync(targetAddon) && !options.force) {
    throw new Error(`Godot MCP addon already exists: ${targetAddon}; pass --force to update it`);
  }

  const existingCodexConfig = existsSync(targetCodexConfig)
    ? readFileSync(targetCodexConfig, "utf8")
    : "";
  const nextCodexConfig = updateCodexConfig(existingCodexConfig, managedConfig(options));

  mkdirSync(dirname(targetAddon), { recursive: true });
  cpSync(sourceAddon, targetAddon, { recursive: true, force: true });
  if (!existsSync(targetProjectConfig)) {
    cpSync(sourceProjectConfig, targetProjectConfig);
  }
  mkdirSync(dirname(targetCodexConfig), { recursive: true });
  writeFileSync(targetCodexConfig, nextCodexConfig, "utf8");

  return {
    projectRoot: options.projectRoot,
    addonPath: targetAddon,
    projectConfigPath: targetProjectConfig,
    codexConfigPath: targetCodexConfig
  };
}

type ParsedArguments = {
  projectRoot?: string;
  codexProjectRoot?: string;
  serverRoot?: string;
  godotExecutable?: string;
  force: boolean;
  help: boolean;
};

function parseArguments(args: string[]): ParsedArguments {
  const parsed: ParsedArguments = { force: false, help: false };
  for (let index = 0; index < args.length; index += 1) {
    const argument = args[index];
    if (argument === "--force") {
      parsed.force = true;
      continue;
    }
    if (argument === "--help" || argument === "-h") {
      parsed.help = true;
      continue;
    }
    const value = args[index + 1];
    if (!value || value.startsWith("--")) {
      throw new Error(`Missing value for ${argument}`);
    }
    if (argument === "--project-root") {
      parsed.projectRoot = value;
    } else if (argument === "--codex-project-root") {
      parsed.codexProjectRoot = value;
    } else if (argument === "--server-root") {
      parsed.serverRoot = value;
    } else if (argument === "--godot-executable") {
      parsed.godotExecutable = value;
    } else {
      throw new Error(`Unknown argument: ${argument}`);
    }
    index += 1;
  }
  return parsed;
}

function usage(): string {
  return [
    "Usage:",
    "  npm run setup-project -- --project-root <path> --godot-executable <path> [--codex-project-root <path>] [--server-root <path>] [--force]",
    "",
    "Run this command from the reusable godot-mcp checkout after npm install."
  ].join("\n");
}

function main(): void {
  const parsed = parseArguments(process.argv.slice(2));
  if (parsed.help) {
    console.log(usage());
    return;
  }
  if (!parsed.projectRoot || !parsed.godotExecutable) {
    throw new Error("--project-root and --godot-executable are required\n\n" + usage());
  }
  const defaultServerRoot = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
  const result = installProject({
    projectRoot: parsed.projectRoot,
    codexProjectRoot: parsed.codexProjectRoot,
    serverRoot: parsed.serverRoot ?? defaultServerRoot,
    godotExecutable: parsed.godotExecutable,
    force: parsed.force
  });
  console.log(`Godot MCP project setup complete: ${result.projectRoot}`);
  console.log(`Addon: ${result.addonPath}`);
  console.log(`Project config: ${result.projectConfigPath}`);
  console.log(`Codex config: ${result.codexConfigPath}`);
  console.log("Enable Godot MCP in Project Settings > Plugins, then restart Codex for this project.");
}

const entrypoint = process.argv[1] ? pathToFileURL(resolve(process.argv[1])).href : "";
if (import.meta.url === entrypoint) {
  try {
    main();
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  }
}
