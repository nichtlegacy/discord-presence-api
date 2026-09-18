/**
 * Runtime configuration. Everything is read once at startup so a misconfigured
 * deployment fails immediately instead of on the first request.
 */

function list(value: string | undefined): string[] {
  return (value ?? "")
    .split(",")
    .map((entry) => entry.trim())
    .filter(Boolean);
}

function int(value: string | undefined, fallback: number): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? Math.floor(parsed) : fallback;
}

/**
 * Hosts the service is ever allowed to talk to. Activity assets are always
 * routed through Discord's own media proxy, so no user-controlled host ends up
 * here — see `toAssetUrl` in lib/assets.ts.
 */
export const ALLOWED_HOSTS = new Set([
  "api.lanyard.rest",
  "dcdn.dstn.to",
  "cdn.discordapp.com",
  "media.discordapp.net",
  // Collectible metadata (nameplate gradient colors); unauthenticated, fixed path.
  "discord.com",
]);

export const config = {
  port: int(process.env.PORT, 8080),

  /**
   * Snowflakes this instance will serve. Empty means the service answers
   * nothing — a personal deployment should never render arbitrary profiles.
   */
  allowedUserIds: new Set(list(process.env.ALLOWED_USER_IDS)),

  /** dcdn.dstn.to enriches the profile (banner, bio, connections). */
  enableDcdn: process.env.ENABLE_DCDN !== "false",

  ttl: {
    presence: int(process.env.PRESENCE_TTL, 60),
    profile: int(process.env.PROFILE_TTL, 300),
    image: int(process.env.IMAGE_TTL, 3600),
    /** Collectible products never change once minted. */
    collectible: int(process.env.COLLECTIBLE_TTL, 86_400),
  },

  limits: {
    /** Upstream request timeout. */
    fetchTimeoutMs: int(process.env.FETCH_TIMEOUT_MS, 5000),
    /** Hard cap per upstream response; oversized bodies are dropped. */
    maxBytes: int(process.env.MAX_FETCH_BYTES, 2_000_000),
    /** Requests per IP per window. */
    rateLimit: int(process.env.RATE_LIMIT, 60),
    rateWindowMs: int(process.env.RATE_WINDOW_MS, 60_000),
  },

  /**
   * Card defaults for this deployment, written as a query string, e.g.
   * `hideStatus=true&hideTag=true`. Request parameters override them.
   */
  defaultParams: Object.fromEntries(new URLSearchParams(process.env.DEFAULT_PARAMS ?? "")),

  /** Set when the container sits behind a reverse proxy that sets XFF. */
  trustProxy: process.env.TRUST_PROXY === "true",
} as const;

export function isAllowedUser(id: string): boolean {
  return config.allowedUserIds.has(id);
}
