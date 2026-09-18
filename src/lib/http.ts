/**
 * The only place in the service that performs outbound requests.
 *
 * Every call is constrained on four axes: scheme, host, time and size. The host
 * allowlist is the load-bearing one — activity assets carry attacker-controlled
 * URLs, and without it a Rich Presence could point this container at an
 * internal address.
 */
import { ALLOWED_HOSTS, config } from "../config.ts";

export class UpstreamError extends Error {
  readonly status: number | undefined;

  constructor(message: string, status?: number) {
    super(message);
    this.name = "UpstreamError";
    this.status = status;
  }
}

export function assertAllowedUrl(raw: string): URL {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    throw new UpstreamError(`malformed url: ${raw.slice(0, 80)}`);
  }
  if (url.protocol !== "https:") {
    throw new UpstreamError(`refused scheme: ${url.protocol}`);
  }
  if (!ALLOWED_HOSTS.has(url.hostname)) {
    throw new UpstreamError(`refused host: ${url.hostname}`);
  }
  return url;
}

/**
 * ponytail: host allowlist + manual redirects, no DNS pinning. A rebinding
 * attack would need control over one of four Discord/Lanyard domains; add
 * resolve-then-connect if that assumption ever stops holding.
 */
async function guardedFetch(raw: string, accept: string): Promise<Response> {
  const url = assertAllowedUrl(raw);
  const response = await fetch(url, {
    redirect: "manual",
    signal: AbortSignal.timeout(config.limits.fetchTimeoutMs),
    headers: {
      accept,
      "user-agent": "discord-presence-api (+https://github.com/nichtlegacy)",
    },
  });
  if (response.status >= 300 && response.status < 400) {
    throw new UpstreamError(`refused redirect from ${url.hostname}`, response.status);
  }
  if (!response.ok) {
    throw new UpstreamError(`upstream ${url.hostname} returned ${response.status}`, response.status);
  }
  return response;
}

/** Reads a body while enforcing the byte cap, streamed so a huge response never lands in memory. */
async function readCapped(response: Response): Promise<Uint8Array> {
  const declared = Number(response.headers.get("content-length") ?? "0");
  if (declared > config.limits.maxBytes) {
    throw new UpstreamError(`response too large: ${declared} bytes`);
  }

  const reader = response.body?.getReader();
  if (!reader) throw new UpstreamError("empty response body");

  const chunks: Uint8Array[] = [];
  let total = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > config.limits.maxBytes) {
      await reader.cancel();
      throw new UpstreamError(`response exceeded ${config.limits.maxBytes} bytes`);
    }
    chunks.push(value);
  }

  const merged = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    merged.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return merged;
}

export async function fetchJson<T>(url: string): Promise<T> {
  const response = await guardedFetch(url, "application/json");
  const body = await readCapped(response);
  return JSON.parse(new TextDecoder().decode(body)) as T;
}

/**
 * Images have to be inlined as data URIs: GitHub proxies the rendered SVG
 * through camo, which does not resolve nested external references.
 */
export async function fetchImageDataUri(url: string): Promise<string> {
  const response = await guardedFetch(url, "image/*");
  const contentType = response.headers.get("content-type") ?? "";
  if (!contentType.startsWith("image/")) {
    throw new UpstreamError(`refused content-type: ${contentType.slice(0, 40)}`);
  }
  const body = await readCapped(response);
  return `data:${contentType.split(";")[0]};base64,${Buffer.from(body).toString("base64")}`;
}

/** Raw bytes for media that is transcoded before it can be embedded. */
export async function fetchBytes(url: string, accept: string): Promise<Uint8Array> {
  return readCapped(await guardedFetch(url, accept));
}
