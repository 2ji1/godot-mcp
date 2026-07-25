import { z } from "zod";

import { parsePropertyValue } from "../typed-values.js";

const pathSchema = z.string().min(1).max(512);
const nodeNameSchema = z.string().min(1).max(64).regex(/^[A-Za-z_][A-Za-z0-9_]*$/);
const classNameSchema = z.string().min(1).max(128).regex(/^[A-Z][A-Za-z0-9_]*$/);
const createNodeSchema = z.object({
  parentPath: pathSchema.default("."),
  type: classNameSchema,
  name: nodeNameSchema
});
const setPropertySchema = z.object({
  nodePath: pathSchema,
  property: z.string().min(1).max(128).regex(/^[A-Za-z_][A-Za-z0-9_]*$/),
  value: z.unknown()
});
const deleteNodeSchema = z.object({
  nodePath: pathSchema,
  confirm: z.literal(true)
});

export type CreateNodeArgs = z.infer<typeof createNodeSchema>;
export type SetPropertyArgs = z.infer<typeof setPropertySchema>;
export type DeleteNodeArgs = z.infer<typeof deleteNodeSchema>;

export function parseCreateNodeArgs(input: unknown): CreateNodeArgs {
  return createNodeSchema.parse(input ?? {});
}

export function parseSetPropertyArgs(input: unknown): SetPropertyArgs {
  const parsed = setPropertySchema.parse(input ?? {});
  return { ...parsed, value: parsePropertyValue(parsed.value) };
}

export function parseDeleteNodeArgs(input: unknown): DeleteNodeArgs {
  return deleteNodeSchema.parse(input ?? {});
}
