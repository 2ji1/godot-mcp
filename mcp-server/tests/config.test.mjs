import assert from "node:assert/strict";
import { fileURLToPath } from "node:url";
import { loadConfig } from "../dist/config.js";

const projectRoot = fileURLToPath(new URL("../..", import.meta.url));
const config = loadConfig(projectRoot);

assert.equal(config.host, "127.0.0.1");
assert.equal(config.port, 8765);
assert.match(config.tokenPath, /\.godot/);
console.log("config.test.mjs passed");
