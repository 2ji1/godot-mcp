import { z } from "zod";

const sceneTreeSchema = z.object({
  maxDepth: z.number().int().min(0).default(8).transform((value) => Math.min(value, 32))
});

export type SceneTreeArgs = z.infer<typeof sceneTreeSchema>;

export function parseSceneTreeArgs(input: unknown): SceneTreeArgs {
  return sceneTreeSchema.parse(input ?? {});
}
