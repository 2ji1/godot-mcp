import { randomBytes } from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, posix, resolve, win32 } from "node:path";

const TOKEN_PATTERN = /^[a-f0-9]{64}$/;

export type UserTokenOptions = {
  tokenPath?: string;
  platform?: NodeJS.Platform;
  env?: NodeJS.ProcessEnv;
  homeDir?: string;
};

function errorCode(error: unknown): string | undefined {
  return typeof error === "object" && error !== null && "code" in error
    ? String(error.code)
    : undefined;
}

function validateToken(raw: string, tokenPath: string): string {
  const token = raw.replace(/^\uFEFF/, "").trim();
  if (!TOKEN_PATTERN.test(token)) {
    throw new Error(`TOKEN_INVALID: Shared Godot MCP token is malformed: ${tokenPath}`);
  }
  return token;
}

export function resolveUserTokenPath(options: UserTokenOptions = {}): string {
  const platform = options.platform ?? process.platform;
  const env = options.env ?? process.env;
  const homeDir = options.homeDir ?? homedir();
  if (options.tokenPath) {
    return resolve(options.tokenPath);
  }
  if (env.GODOT_MCP_TOKEN_PATH) {
    return resolve(env.GODOT_MCP_TOKEN_PATH);
  }
  if (platform === "win32") {
    const stateRoot = env.LOCALAPPDATA || win32.join(homeDir, "AppData", "Local");
    return win32.resolve(stateRoot, "godot-mcp", "auth-token");
  }
  if (platform === "darwin") {
    return posix.resolve(homeDir, "Library", "Application Support", "godot-mcp", "auth-token");
  }
  const stateRoot = env.XDG_STATE_HOME || posix.join(homeDir, ".local", "state");
  return posix.resolve(stateRoot, "godot-mcp", "auth-token");
}

export function readUserToken(options: UserTokenOptions = {}): string {
  const tokenPath = resolveUserTokenPath(options);
  try {
    return validateToken(readFileSync(tokenPath, "utf8"), tokenPath);
  } catch (error) {
    if (errorCode(error) === "ENOENT") {
      throw new Error(`TOKEN_NOT_FOUND: Shared Godot MCP token does not exist: ${tokenPath}`);
    }
    throw error;
  }
}

export function getOrCreateUserToken(options: UserTokenOptions = {}): string {
  const tokenPath = resolveUserTokenPath(options);
  const token = randomBytes(32).toString("hex");
  mkdirSync(dirname(tokenPath), { recursive: true });
  try {
    writeFileSync(tokenPath, token + "\n", { encoding: "utf8", flag: "wx", mode: 0o600 });
    return token;
  } catch (error) {
    if (errorCode(error) === "EEXIST") {
      return readUserToken({ ...options, tokenPath });
    }
    throw error;
  }
}

export function rotateUserToken(options: UserTokenOptions = {}): string {
  const tokenPath = resolveUserTokenPath(options);
  const token = randomBytes(32).toString("hex");
  mkdirSync(dirname(tokenPath), { recursive: true });
  writeFileSync(tokenPath, token + "\n", { encoding: "utf8", mode: 0o600 });
  return token;
}
