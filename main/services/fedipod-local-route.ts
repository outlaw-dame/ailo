type Fetcher = typeof fetch;

function record(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** Use loopback only when the paired daemon proves it serves the configured public host. */
export async function resolveLocalFediPodBase(
  baseUrl: string,
  gateToken: string | null | undefined,
  fetcher: Fetcher = fetch,
): Promise<string | null> {
  if (!gateToken) return null;
  let desiredHost: string;
  try { desiredHost = new URL(baseUrl).host.toLowerCase(); } catch { return null; }
  try {
    const response = await fetcher("http://127.0.0.1:8030/admin/ailo-pair", {
      headers: { Accept: "application/json" }, signal: AbortSignal.timeout(1_500),
    });
    if (!response.ok) return null;
    const status: unknown = await response.json();
    if (!record(status) || status.ready !== true || !Array.isArray(status.allowedHosts)
      || !status.allowedHosts.every((host) => typeof host === "string")
      || !status.allowedHosts.map((host) => host.toLowerCase()).includes(desiredHost)) return null;
    return "http://127.0.0.1:8030";
  } catch { return null; }
}
