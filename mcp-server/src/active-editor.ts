import { z } from "zod";
import { BridgeError, type GodotBridge } from "./godot-bridge.js";

const activeEditorStatusSchema = z.object({
  projectPath: z.string().trim().min(1),
  godotVersion: z.string(),
  scenePath: z.string(),
  rootName: z.string(),
  rootType: z.string()
});

export type ActiveEditorStatus = z.infer<typeof activeEditorStatusSchema>;

export async function getActiveEditorStatus(
  bridge: Pick<GodotBridge, "request">
): Promise<ActiveEditorStatus> {
  const result = await bridge.request("editor.status", {});
  const parsed = activeEditorStatusSchema.safeParse(result);
  if (!parsed.success) {
    throw new BridgeError("NO_ACTIVE_EDITOR", "Active Godot editor did not report a project path");
  }
  return parsed.data;
}
