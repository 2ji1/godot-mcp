import assert from "node:assert/strict";
import { parseSetPropertyArgs } from "../dist/tools/mutations.js";

const vector = { $godotType: "Vector3", x: 1, y: 1, z: 1 };
const color = { $godotType: "Color", r: 1, g: 0, b: 0, a: 1 };
const material = {
  $godotType: "StandardMaterial3D",
  properties: {
    albedo_color: color,
    metallic: 1
  }
};

assert.deepEqual(parseSetPropertyArgs({ nodePath: "Cube", property: "size", value: vector }).value, vector);
assert.deepEqual(parseSetPropertyArgs({ nodePath: "Cube", property: "material", value: material }).value, material);
assert.deepEqual(parseSetPropertyArgs({ nodePath: "Node", property: "metadata", value: { nested: [true, null, "ok"] } }).value, {
  nested: [true, null, "ok"]
});

assert.throws(() => parseSetPropertyArgs({ nodePath: "Cube", property: "size", value: { $godotType: "Quaternion", x: 0, y: 0, z: 0, w: 1 } }));
assert.throws(() => parseSetPropertyArgs({ nodePath: "Cube", property: "size", value: { $godotType: "Vector3", x: 1, y: 1 } }));
assert.throws(() => parseSetPropertyArgs({ nodePath: "Cube", property: "size", value: { $godotType: "Vector3", x: Number.POSITIVE_INFINITY, y: 1, z: 1 } }));
assert.throws(() => parseSetPropertyArgs({ nodePath: "Cube", property: "material", value: {
  $godotType: "StandardMaterial3D",
  properties: { roughness: 0.5 }
} }));

console.log("typed-values.test.mjs passed");
