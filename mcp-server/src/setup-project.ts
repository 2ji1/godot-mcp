import { cpSync, existsSync, mkdirSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import {
  getOrCreateUserToken,
  resolveUserTokenPath,
  rotateUserToken
} from "./user-token.js";

export type ProjectSetupOptions = {
  projectRoot: string;
  serverRoot: string;
  force: boolean;
  repairToken: boolean;
  tokenPath?: string;
};

export type ProjectSetupResult = {
  projectRoot: string;
  addonPath: string;
  tokenPath: string;
};

function requirePath(path: string, description: string): void {
  if (!existsSync(path)) {
    throw new Error(`${description} does not exist: ${path}`);
  }
}

export function installProject(rawOptions: ProjectSetupOptions): ProjectSetupResult {
  const projectRoot = resolve(rawOptions.projectRoot);
  const serverRoot = resolve(rawOptions.serverRoot);
  const sourceAddon = join(serverRoot, "addons", "godot_mcp");
  const addonPath = join(projectRoot, "addons", "godot_mcp");
  const tokenPath = resolveUserTokenPath({ tokenPath: rawOptions.tokenPath });

  requirePath(join(projectRoot, "project.godot"), "Godot project file");
  requirePath(sourceAddon, "Godot MCP addon source");
  if (existsSync(addonPath) && !rawOptions.force) {
    throw new Error(`Godot MCP addon already exists: ${addonPath}; pass --force to update it`);
  }

  if (rawOptions.repairToken) {
    rotateUserToken({ tokenPath });
  } else {
    getOrCreateUserToken({ tokenPath });
  }

  mkdirSync(dirname(addonPath), { recursive: true });
  cpSync(sourceAddon, addonPath, { recursive: true, force: true });

  return { projectRoot, addonPath, tokenPath };
}

type ParsedArguments = {
  projectRoot?: string;
  serverRoot?: string;
  force: boolean;
  repairToken: boolean;
  help: boolean;
};

function parseArguments(args: string[]): ParsedArguments {
  const parsed: ParsedArguments = { force: false, repairToken: false, help: false };
  for (let index = 0; index < args.length; index += 1) {
    const argument = args[index];
    if (argument === "--force") {
      parsed.force = true;
      continue;
    }
    if (argument === "--repair-token") {
      parsed.repairToken = true;
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
    } else if (argument === "--server-root") {
      parsed.serverRoot = value;
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
    "  npm run setup-project -- --project-root <path> [--force] [--repair-token] [--server-root <path>]",
    "",
    "Installs the Godot MCP addon into one project and prepares the shared user token.",
    "--server-root is intended only for development checkouts."
  ].join("\n");
}

function main(): void {
  const parsed = parseArguments(process.argv.slice(2));
  if (parsed.help) {
    console.log(usage());
    return;
  }
  if (!parsed.projectRoot) {
    throw new Error("--project-root is required\n\n" + usage());
  }
  const defaultServerRoot = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
  const result = installProject({
    projectRoot: parsed.projectRoot,
    serverRoot: parsed.serverRoot ?? defaultServerRoot,
    force: parsed.force,
    repairToken: parsed.repairToken
  });
  console.log(`Godot MCP project setup complete: ${result.projectRoot}`);
  console.log(`Addon: ${result.addonPath}`);
  console.log(`Shared token: ${result.tokenPath}`);
  console.log("Enable Godot MCP in Project Settings > Plugins. Keep only the target editor open.");
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
