import assert from "node:assert/strict";
import { parseSceneTreeArgs } from "../dist/tools/scene.js";

assert.deepEqual(parseSceneTreeArgs({ maxDepth: 4 }), { maxDepth: 4 });
assert.deepEqual(parseSceneTreeArgs({}), { maxDepth: 8 });
assert.deepEqual(parseSceneTreeArgs({ maxDepth: 99 }), { maxDepth: 32 });
assert.throws(() => parseSceneTreeArgs({ maxDepth: -1 }), /Too small/);
console.log("tools.test.mjs passed");

