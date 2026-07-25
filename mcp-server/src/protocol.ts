import { z } from "zod";

const bridgeResponseSchema = z.discriminatedUnion("ok", [
  z.object({
    id: z.string().min(1),
    ok: z.literal(true),
    result: z.unknown()
  }),
  z.object({
    id: z.string().min(1),
    ok: z.literal(false),
    error: z.object({
      code: z.string().min(1),
      message: z.string().min(1)
    })
  })
]);

export type BridgeSuccess = z.infer<typeof bridgeResponseSchema> & { ok: true };
export type BridgeFailure = z.infer<typeof bridgeResponseSchema> & { ok: false };
export type BridgeResponse = z.infer<typeof bridgeResponseSchema>;

export function parseBridgeMessage(raw: string): BridgeResponse {
  let value: unknown;
  try {
    value = JSON.parse(raw);
  } catch {
    throw new Error("PROTOCOL_ERROR: invalid JSON");
  }

  const parsed = bridgeResponseSchema.safeParse(value);
  if (!parsed.success) {
    throw new Error("PROTOCOL_ERROR: invalid bridge message");
  }
  return parsed.data;
}

export function makeBridgeRequest(id: string, method: string, params: Record<string, unknown>) {
  return JSON.stringify({ id, method, params });
}
