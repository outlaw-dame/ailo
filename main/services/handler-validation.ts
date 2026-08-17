import { t } from "./i18n.js";

/**
 * Shared IPC input-validation helpers for main/handlers/*.ts. Every message
 * these throw is user-reachable: the renderer's mutation `onError` handlers
 * do `toast.error(error.message || ...)`, so whatever lands in `.message`
 * here shows up directly on screen. They go through the same t() the rest
 * of the app uses rather than being hardcoded English, same as everything
 * else that already went through the i18n pass.
 *
 * `fieldKey`/`nounKey` are translation.json keys (e.g. "backendFields.postId"),
 * not literal English — every handler file was passing a raw English label
 * here before ("Post id", "FediPod URL", ...); those labels moved into the
 * backendFields namespace so the composed message translates as a whole.
 */

export function requireString(value: unknown, fieldKey: string): string {
  if (typeof value !== "string" || !value.trim()) {
    throw new Error(t("backendCommon.fieldRequired", { field: t(fieldKey) }));
  }
  return value;
}

export function postNotFoundError(id: string): Error {
  return new Error(t("backendCommon.postNotFound", { id }));
}
