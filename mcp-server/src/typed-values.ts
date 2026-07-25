import { z } from "zod";

const finiteNumberSchema = z.number().finite();

const vector3Schema = z.object({
  $godotType: z.literal("Vector3"),
  x: finiteNumberSchema,
  y: finiteNumberSchema,
  z: finiteNumberSchema
}).strict();

const colorSchema = z.object({
  $godotType: z.literal("Color"),
  r: finiteNumberSchema,
  g: finiteNumberSchema,
  b: finiteNumberSchema,
  a: finiteNumberSchema
}).strict();

const materialPropertiesSchema = z.object({
  albedo_color: colorSchema.optional(),
  metallic: finiteNumberSchema.optional()
}).strict().refine((properties) => Object.keys(properties).length > 0, "StandardMaterial3D requires a supported property");

const standardMaterialSchema = z.object({
  $godotType: z.literal("StandardMaterial3D"),
  properties: materialPropertiesSchema
}).strict();

const taggedValueSchema = z.union([vector3Schema, colorSchema, standardMaterialSchema]);

const propertyValueSchema: z.ZodType<unknown> = z.lazy(() => z.union([
  z.null(),
  z.boolean(),
  finiteNumberSchema,
  z.string(),
  z.array(propertyValueSchema),
  taggedValueSchema,
  z.record(z.string(), propertyValueSchema).superRefine((value, context) => {
    if (Object.prototype.hasOwnProperty.call(value, "$godotType")) {
      context.addIssue({ code: "custom", message: "Unknown Godot value type" });
    }
  })
])).superRefine((value, context) => {
  let serialized: string | undefined;
  try {
    serialized = JSON.stringify(value);
  } catch {
    context.addIssue({ code: "custom", message: "Property value must be JSON serializable" });
    return;
  }
  if (serialized === undefined || Buffer.byteLength(serialized, "utf8") > 64 * 1024) {
    context.addIssue({ code: "custom", message: "Property value must not exceed 64 KiB" });
  }
});

export function parsePropertyValue(value: unknown): unknown {
  return propertyValueSchema.parse(value);
}
