import en from "../../renderer/locales/en/translation.json";

type Params = Record<string, string | number>;

function resolve(key: string): unknown {
  return key.split(".").reduce<unknown>(
    (node, part) => (node && typeof node === "object" ? (node as Record<string, unknown>)[part] : undefined),
    en,
  );
}

function interpolate(template: string, params?: Params): string {
  if (!params) return template;
  return template.replace(/\{\{(\w+)\}\}/g, (_match, name: string) => String(params[name] ?? ""));
}

/**
 * Minimal main-process translation lookup. There's no react-i18next here —
 * this is plain Node, not a React tree — and no locale switching yet (the
 * renderer side is English-only too, via i18next's own `supportedLngs:
 * ["en"]`). Reads straight from the same renderer/locales/en/translation.json
 * the renderer uses, so app strings live in exactly one place regardless of
 * which process shows them (a native OS notification, the app menu, and a
 * BrowserWindow title all come from here rather than a second copy).
 *
 * Supports `{{placeholder}}` interpolation and i18next's `_one`/`_other`
 * plural-key convention — pass `count` and the right suffix is picked
 * automatically, same as the renderer's t().
 */
export function t(key: string, params?: Params & { count?: number }): string {
  const pluralKey = typeof params?.count === "number"
    ? `${key}_${params.count === 1 ? "one" : "other"}`
    : key;
  const value = resolve(pluralKey) ?? resolve(key);
  if (typeof value !== "string") return key;
  return interpolate(value, params);
}
