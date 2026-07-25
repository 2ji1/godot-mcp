import assert from "node:assert/strict";
import { parseCreateNodeArgs, parseDeleteNodeArgs, parseSetPropertyArgs } from "../dist/tools/mutations.js";

assert.deepEqual(parseCreateNodeArgs({ type: "Node2D", name: "Marker" }), {
  parentPath: ".",
  type: "Node2D",
  name: "Marker"
});
assert.throws(() => parseCreateNodeArgs({ type: "Node2D", name: "" }));
assert.throws(() => parseCreateNodeArgs({ type: "node2d", name: "Marker" }));
assert.deepEqual(parseSetPropertyArgs({ nodePath: "Marker", property: "visible", value: false }), {
  nodePath: "Marker",
  property: "visible",
  value: false
});
assert.throws(() => parseDeleteNodeArgs({ nodePath: "Marker", confirm: false }));
assert.deepEqual(parseDeleteNodeArgs({ nodePath: "Marker", confirm: true }), {
  nodePath: "Marker",
  confirm: true
});
console.log("mutations.test.mjs passed");
