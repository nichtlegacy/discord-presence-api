/**
 * Merge layer: Lanyard supplies presence, dcdn supplies profile decoration.
 *
 * The important difference to cnrad's renderer is that activities are kept
 * generic. Filtering to `type === 0` plus a Spotify special case drops exactly
 * the case that motivated this service — a custom app announcing `type: 2`
 * (listening) with its own assets.
 */
import type { DcdnResponse } from "./dcdn.ts";
import type { LanyardActivity, LanyardData } from "./lanyard.ts";
import {
  avatarUrl,
  badgeIconUrl,
  bannerUrl,
  clanBadgeUrl,
  decorationUrl,
  emojiUrl,
  nameplateUrl,
  nameplateVideoUrl,
  toAssetUrl,
} from "./assets.ts";
import type {
  ActivityType,
  DiscordStatus,
  NormalizedActivity,
  NormalizedPresence,
  NormalizedProfile,
  NormalizedUser,
  PresencePayload,
} from "./types.ts";

const ACTIVITY_TYPES: Record<number, ActivityType> = {
  0: "playing",
  1: "streaming",
  2: "listening",
  3: "watching",
  4: "custom",
  5: "competing",
};

const STATUSES: DiscordStatus[] = ["online", "idle", "dnd", "offline"];

/** Upstream strings land in an SVG; cap them and drop control characters. */
function text(value: unknown, max = 128): string | null {
  if (typeof value !== "string") return null;
  const cleaned = value.replace(/\p{Cc}/gu, "").trim();
  return cleaned ? cleaned.slice(0, max) : null;
}

/**
 * Bios carry custom emoji as `<:name:id>` / `<a:name:id>`. Rendered as text
 * that is just noise, and the images cannot be resolved inline per emoji.
 */
function richText(value: unknown, max = 128): string | null {
  if (typeof value !== "string") return null;
  return text(value.replace(/<a?:[A-Za-z0-9_]+:\d+>/g, " ").replace(/\s+/g, " "), max);
}

function hex(value: unknown): string | null {
  if (typeof value === "string") {
    return /^#?[0-9a-fA-F]{6}$/.test(value) ? (value.startsWith("#") ? value : `#${value}`) : null;
  }
  if (typeof value === "number" && Number.isFinite(value) && value >= 0) {
    return `#${Math.floor(value).toString(16).padStart(6, "0")}`;
  }
  return null;
}

/** Links are passed through to clients, never fetched — but keep them well-formed. */
function httpsOnly(value: unknown): string | null {
  if (typeof value !== "string" || !value.startsWith("https://")) return null;
  return URL.canParse(value) ? value.slice(0, 256) : null;
}

function normalizeActivity(activity: LanyardActivity): NormalizedActivity {
  const start = typeof activity.timestamps?.start === "number" ? activity.timestamps.start : null;
  return {
    type: ACTIVITY_TYPES[activity.type] ?? "unknown",
    rawType: activity.type,
    applicationId: text(activity.application_id, 32),
    name: text(activity.name) ?? "Unknown",
    details: text(activity.details),
    state: text(activity.state),
    largeText: text(activity.assets?.large_text),
    smallText: text(activity.assets?.small_text),
    images: {
      large: toAssetUrl(activity.assets?.large_image, activity.application_id, 160),
      small: toAssetUrl(activity.assets?.small_image, activity.application_id, 64),
    },
    urls: {
      details: httpsOnly(activity.details_url),
      state: httpsOnly(activity.state_url),
      large: httpsOnly(activity.assets?.large_url),
    },
    buttons: (activity.buttons ?? []).map((b) => text(b, 64)).filter((b): b is string => !!b),
    timestamps: {
      start,
      end: typeof activity.timestamps?.end === "number" ? activity.timestamps.end : null,
    },
    elapsedSeconds: start ? Math.max(0, Math.floor((Date.now() - start) / 1000)) : null,
  };
}

export function normalizePresence(data: LanyardData): NormalizedPresence {
  const raw = data.activities ?? [];
  const custom = raw.find((a) => a.type === 4);
  const activities = raw.filter((a) => a.type !== 4).map(normalizeActivity);

  const status = STATUSES.includes(data.discord_status as DiscordStatus)
    ? (data.discord_status as DiscordStatus)
    : "offline";

  const listening = activities.find((a) => a.type === "listening") ?? null;

  return {
    status,
    platforms: {
      desktop: !!data.active_on_discord_desktop,
      mobile: !!data.active_on_discord_mobile,
      web: !!data.active_on_discord_web,
      embedded: !!data.active_on_discord_embedded,
      vr: !!data.active_on_discord_vr,
    },
    customStatus: custom
      ? {
          text: richText(custom.state),
          emoji: emojiUrl(custom.emoji?.id ?? null, !!custom.emoji?.animated),
          emojiName: text(custom.emoji?.name, 32),
        }
      : null,
    activities,
    // A game outranks music, matching how Discord itself leads a profile.
    primary: activities.find((a) => a.type === "playing") ?? listening ?? activities[0] ?? null,
    listening,
  };
}

export interface UserOptions {
  animatedAvatar?: boolean;
  animatedDecoration?: boolean;
  animatedBanner?: boolean;
  /** Gradient painted behind the nameplate, from the collectible product. */
  nameplateColors?: [string, string] | null;
  nameplateLabel?: string | null;
}

export function normalizeUser(
  data: LanyardData,
  dcdn: DcdnResponse | null,
  options: UserOptions = {},
): NormalizedUser {
  const user = data.discord_user ?? {};
  const id = user.id ?? "";
  const nameplateAsset = user.collectibles?.nameplate?.asset ?? null;

  return {
    id,
    username: text(user.username, 32) ?? "unknown",
    displayName: text(user.global_name ?? user.display_name ?? user.username, 32) ?? "unknown",
    avatar: avatarUrl(id, user.avatar ?? null, 128, options.animatedAvatar !== false),
    avatarDecoration: decorationUrl(
      user.avatar_decoration_data?.asset ?? null,
      options.animatedDecoration === true,
    ),
    banner: bannerUrl(id, dcdn?.user?.banner ?? null, 512, options.animatedBanner === true),
    bannerColor: hex(dcdn?.user?.banner_color),
    accentColor: hex(dcdn?.user?.accent_color),
    clan: user.primary_guild?.tag
      ? {
          tag: text(user.primary_guild.tag, 8) ?? "",
          badge: clanBadgeUrl(
            user.primary_guild.identity_guild_id ?? null,
            user.primary_guild.badge ?? null,
          ),
        }
      : null,
    nameplate: nameplateAsset
      ? {
          asset: nameplateAsset,
          palette: text(user.collectibles?.nameplate?.palette, 32),
          image: nameplateUrl(nameplateAsset),
          video: nameplateVideoUrl(nameplateAsset),
          colors: options.nameplateColors ?? null,
          label: options.nameplateLabel ?? text(user.collectibles?.nameplate?.label, 40),
        }
      : null,
    displayNameStyles: user.display_name_styles
      ? {
          fontId: user.display_name_styles.font_id ?? 0,
          effectId: user.display_name_styles.effect_id ?? 0,
          colors: (user.display_name_styles.colors ?? []).map(hex).filter((c): c is string => !!c),
        }
      : null,
  };
}

export function normalizeProfile(dcdn: DcdnResponse | null): NormalizedProfile | null {
  if (!dcdn) return null;
  const themeColors = (dcdn.user_profile?.theme_colors ?? [])
    .map(hex)
    .filter((c): c is string => !!c);
  return {
    bio: richText(dcdn.user_profile?.bio, 180),
    pronouns: text(dcdn.user_profile?.pronouns, 40),
    connectedAccounts: (dcdn.connected_accounts ?? [])
      .map((account) => ({
        type: text(account.type, 32) ?? "",
        name: text(account.name, 64) ?? "",
        verified: !!account.verified,
      }))
      .filter((account) => account.type && account.name),
    themeColors: themeColors.length >= 2 ? [themeColors[0]!, themeColors[1]!] : null,
    badges: (dcdn.badges ?? [])
      .map((badge) => ({
        id: text(badge.id, 48) ?? "",
        description: text(badge.description, 64) ?? "",
        icon: badgeIconUrl(badge.icon ?? null),
      }))
      .filter((badge) => badge.id && badge.icon),
    legacyUsername: text(dcdn.legacy_username, 40),
  };
}

export function buildPayload(
  lanyard: LanyardData,
  dcdn: DcdnResponse | null,
  options: UserOptions = {},
): PresencePayload {
  return {
    user: normalizeUser(lanyard, dcdn, options),
    profile: normalizeProfile(dcdn),
    presence: normalizePresence(lanyard),
    meta: {
      sources: { lanyard: true, dcdn: dcdn !== null },
      fetchedAt: new Date().toISOString(),
      kv: lanyard.kv ?? {},
    },
  };
}
