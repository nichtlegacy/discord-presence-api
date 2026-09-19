/**
 * Image inlining for the SVG card.
 *
 * GitHub serves README images through its camo proxy, which fetches the SVG but
 * not anything the SVG references. Every image therefore has to travel inside
 * the document as a data URI. Failures are swallowed: a missing cover is a
 * placeholder, not a broken card.
 *
 * Only what the requested layout actually shows is fetched — an animated avatar
 * alone can outweigh the rest of the document.
 */
import { animatedNameplate } from "../lib/animate.ts";
import { config } from "../config.ts";
import { TtlCache } from "../lib/cache.ts";
import { fetchImageDataUri } from "../lib/http.ts";
import type { PresencePayload } from "../lib/types.ts";
import type { CardParams } from "./params.ts";
import type { Selection } from "./select.ts";
import { baseColor } from "./theme.ts";

const imageCache = new TtlCache<string>(256);

export interface CardImages {
  avatar: string | null;
  decoration: string | null;
  banner: string | null;
  nameplate: string | null;
  clanBadge: string | null;
  badges: string[];
  statusEmoji: string | null;
  activityLarge: string | null;
  activitySmall: string | null;
  secondaryLarge: string | null;
}

async function inline(url: string | null | undefined): Promise<string | null> {
  if (!url) return null;
  try {
    return await imageCache.wrap(url, config.ttl.image, () => fetchImageDataUri(url));
  } catch {
    return null;
  }
}

/** Animated when asked for and transcodable, static otherwise. */
async function nameplateImage(payload: PresencePayload, params: CardParams): Promise<string | null> {
  const plate = payload.user.nameplate;
  if (!plate) return null;
  if (params.animatedNameplate && plate.video) {
    const animated = await animatedNameplate(plate.video, baseColor(params, payload));
    if (animated) return animated;
  }
  return inline(plate.image);
}

export async function collectImages(
  payload: PresencePayload,
  params: CardParams,
  selection: Selection,
): Promise<CardImages> {
  const showProfile = !params.hideProfile;
  const wantsBanner = params.layout === "banner" && !params.hideBanner;

  const [avatar, decoration, banner, nameplate, clanBadge, statusEmoji, activityLarge, activitySmall, secondaryLarge] =
    await Promise.all([
      showProfile ? inline(payload.user.avatar) : null,
      showProfile && !params.hideDecoration ? inline(payload.user.avatarDecoration) : null,
      wantsBanner ? inline(payload.user.banner) : null,
      showProfile && !params.hideNameplate ? nameplateImage(payload, params) : null,
      showProfile && !params.hideTag ? inline(payload.user.clan?.badge) : null,
      showProfile && !params.hideStatus ? inline(payload.presence.customStatus?.emoji) : null,
      inline(selection.primary?.images.large),
      inline(selection.primary?.images.small),
      inline(selection.secondary?.images.large),
    ]);

  const badgeUrls =
    showProfile && !params.hideBadges
      ? (payload.profile?.badges ?? []).slice(0, params.maxBadges).map((badge) => badge.icon)
      : [];
  const badges = (await Promise.all(badgeUrls.map(inline))).filter((b): b is string => !!b);

  return {
    avatar,
    decoration,
    banner,
    nameplate,
    clanBadge,
    badges,
    statusEmoji,
    activityLarge,
    activitySmall,
    secondaryLarge,
  };
}
