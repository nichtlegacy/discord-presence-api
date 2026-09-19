/**
 * Discord CDN URL construction.
 *
 * Activity assets arrive as `mp:external/<hash>/https/<host>/<path>`. cnrad's
 * renderer rewrites that back to the origin URL and fetches it directly, which
 * turns any Rich Presence into an SSRF primitive. Discord already mirrors these
 * images on media.discordapp.net, so we use the proxy form instead: same image,
 * same hash, but the request never leaves an allowlisted host.
 */
/**
 * Activity asset formats, per Discord's presence documentation:
 *
 *   {asset_id}        → cdn.discordapp.com/app-assets/{app_id}/{id}.png
 *   mp:{image_id}     → media.discordapp.net/{image_id}
 *   spotify:{id}      → i.scdn.co/image/{id}
 *   twitch:{user}     → static-cdn.jtvnw.net/previews-ttv/live_user_{user}-{w}x{h}.jpg
 *   youtube:{video}   → i.ytimg.com/vi/{video}/hqdefault.jpg
 *
 * Everything after the prefix is attacker-controlled — whoever sets the
 * presence picks it — so each form is validated against its own character set
 * before it becomes part of a URL. The host is never taken from the input.
 */
const SPOTIFY_ID = /^[A-Za-z0-9]{1,64}$/;
/**
 * Spotify encodes the edge length in the image id's prefix. Requesting the
 * 640px master for a 72px cover costs 142 KB against 40 KB for the 300px one
 * and 3 KB for the thumbnail — more than the rest of the card put together.
 */
const SPOTIFY_SIZES: Array<{ prefix: string; edge: number }> = [
  { prefix: "ab67616d00004851", edge: 64 },
  { prefix: "ab67616d00001e02", edge: 300 },
  { prefix: "ab67616d0000b273", edge: 640 },
];
const TWITCH_USER = /^[A-Za-z0-9_]{1,32}$/;
const YOUTUBE_ID = /^[A-Za-z0-9_-]{1,24}$/;
/** Media-proxy paths are segment lists; no traversal, no query, no host. */
const MP_PATH = /^[A-Za-z0-9._~\-/]{1,512}$/;

/** Swaps the size prefix for the smallest variant that still covers the render. */
function spotifyAtSize(id: string, size: number): string {
  const current = SPOTIFY_SIZES.find((entry) => id.startsWith(entry.prefix));
  if (!current) return id;
  // `size` is already the request size, twice what the card draws.
  const wanted = SPOTIFY_SIZES.find((entry) => entry.edge >= size) ?? current;
  return wanted.edge < current.edge ? `${wanted.prefix}${id.slice(current.prefix.length)}` : id;
}

export function toAssetUrl(
  asset: string | null | undefined,
  applicationId: string | null | undefined,
  size: number,
): string | null {
  if (!asset) return null;

  if (asset.startsWith("spotify:")) {
    const id = asset.slice(8);
    return SPOTIFY_ID.test(id) ? `https://i.scdn.co/image/${spotifyAtSize(id, size)}` : null;
  }

  if (asset.startsWith("twitch:")) {
    const user = asset.slice(7);
    if (!TWITCH_USER.test(user)) return null;
    return `https://static-cdn.jtvnw.net/previews-ttv/live_user_${user}-${size}x${size}.jpg`;
  }

  if (asset.startsWith("youtube:")) {
    const video = asset.slice(8);
    return YOUTUBE_ID.test(video) ? `https://i.ytimg.com/vi/${video}/hqdefault.jpg` : null;
  }

  if (asset.startsWith("mp:")) {
    const path = asset.slice(3);
    if (!MP_PATH.test(path) || path.includes("..")) return null;
    // Covers mp:external/... and mp:attachments/...; the proxy resizes for us,
    // and the origin behind an external asset is never contacted directly.
    return `https://media.discordapp.net/${path}?width=${size}&height=${size}`;
  }

  // Some apps send a fully qualified asset; only Discord's own CDN is accepted.
  if (asset.startsWith("https://")) {
    const host = URL.canParse(asset) ? new URL(asset).hostname : "";
    return host === "cdn.discordapp.com" || host === "media.discordapp.net" ? asset : null;
  }

  if (!applicationId) return null;
  return `https://cdn.discordapp.com/app-assets/${applicationId}/${asset}.png?size=${size}`;
}

export function avatarUrl(userId: string, hash: string | null, size = 128, animated = true): string {
  if (!hash) {
    const index = Number(BigInt(userId) >> 22n) % 6;
    return `https://cdn.discordapp.com/embed/avatars/${index}.png?size=${size}`;
  }
  // An animated avatar as a GIF is by far the heaviest part of the payload.
  const extension = hash.startsWith("a_") && animated ? "gif" : "webp";
  return `https://cdn.discordapp.com/avatars/${userId}/${hash}.${extension}?size=${size}`;
}

/**
 * An animated banner as a GIF is several hundred KB — an order of magnitude
 * more than the rest of the card — so it stays opt-in.
 */
export function bannerUrl(
  userId: string,
  hash: string | null,
  size = 512,
  animated = false,
): string | null {
  if (!hash) return null;
  const extension = hash.startsWith("a_") && animated ? "gif" : "webp";
  return `https://cdn.discordapp.com/banners/${userId}/${hash}.${extension}?size=${size}`;
}

export function clanBadgeUrl(guildId: string | null, badge: string | null): string | null {
  if (!guildId || !badge) return null;
  return `https://cdn.discordapp.com/clan-badges/${guildId}/${badge}.png?size=32`;
}

export function emojiUrl(id: string | null, animated: boolean): string | null {
  if (!id) return null;
  return `https://cdn.discordapp.com/emojis/${id}.${animated ? "gif" : "webp"}?size=32`;
}

export function decorationUrl(asset: string | null, animated = false): string | null {
  if (!asset) return null;
  return `https://cdn.discordapp.com/avatar-decoration-presets/${asset}.png?size=96&passthrough=${animated}`;
}

/**
 * Collectible assets end in a slash; the file name is appended. The animated
 * variant is a .webm, which an SVG cannot play — the static render is the only
 * usable one here.
 */
export function nameplateUrl(asset: string | null): string | null {
  if (!asset) return null;
  return `https://cdn.discordapp.com/assets/collectibles/${asset}static.png`;
}

/**
 * The animated variant of a collectible. Discord ships it as .webm, which an
 * SVG cannot play — it has to be transcoded before it can be embedded.
 */
export function nameplateVideoUrl(asset: string | null): string | null {
  if (!asset) return null;
  return `https://cdn.discordapp.com/assets/collectibles/${asset}asset.webm`;
}

/** dcdn ships badge icon hashes, so no local badge table is needed. */
export function badgeIconUrl(icon: string | null): string | null {
  if (!icon || !/^[a-f0-9]{6,64}$/i.test(icon)) return null;
  return `https://cdn.discordapp.com/badge-icons/${icon}.png`;
}
