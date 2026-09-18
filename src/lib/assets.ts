/**
 * Discord CDN URL construction.
 *
 * Activity assets arrive as `mp:external/<hash>/https/<host>/<path>`. cnrad's
 * renderer rewrites that back to the origin URL and fetches it directly, which
 * turns any Rich Presence into an SSRF primitive. Discord already mirrors these
 * images on media.discordapp.net, so we use the proxy form instead: same image,
 * same hash, but the request never leaves an allowlisted host.
 */
const MP_EXTERNAL = /^mp:external\//;

export function toAssetUrl(
  asset: string | null | undefined,
  applicationId: string | null | undefined,
  size: number,
): string | null {
  if (!asset) return null;

  if (MP_EXTERNAL.test(asset)) {
    const path = asset.replace(MP_EXTERNAL, "");
    return `https://media.discordapp.net/external/${path}?width=${size}&height=${size}`;
  }

  // Some apps send fully qualified https assets; only Discord's own CDN is accepted.
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
