/** Remove transport wrappers while retaining the complete backend/provider cause. */
export function actionableError(error: unknown, fallback: string): string {
  let message = error instanceof Error ? error.message : String(error || "");
  message = message.replace(/^Error invoking remote method '[^']+':\s*(?:Error:\s*)?/i, "");
  message = message.replace(/^FediPod request failed \(\d+\):\s*/i, "");
  return message.trim() || fallback;
}
