/**
 * Query parameter validation.
 *
 * Every value here ends up in an SVG style attribute or as visible text, so
 * nothing is passed through unchecked: colors must match a hex pattern, choices
 * must be members of a known set, free text is length-capped. React escapes the
 * text it renders, but a raw color string would otherwise be a CSS injection.
 *
 * The parameter names mirror cnrad/lanyard-profile-readme so existing URLs port
 * over unchanged; everything beyond that set is additive.
 */

// No "auto": a README picks the theme with <picture> + prefers-color-scheme,
// which beats guessing inside an image that cannot run media queries.
export const THEMES = ["dark", "light"] as const;
export const LAYOUTS = ["card", "wide", "banner"] as const;

export type Theme = (typeof THEMES)[number];
export type Layout = (typeof LAYOUTS)[number];
export type HideActivity = boolean | "whenNotUsed";

export interface CardParams {
  // --- appearance ---
  theme: Theme;
  layout: Layout;
  bg: string | null;
  accent: string | null;
  borderRadius: number;
  clanBackgroundColor: string | null;
  /** Paint the card with the user's Nitro profile gradient. */
  profileGradient: boolean;

  // --- identity ---
  showDisplayName: boolean;
  showUsername: boolean;
  hideProfile: boolean;
  hideDecoration: boolean;
  animated: boolean;
  animatedDecoration: boolean;
  animatedBanner: boolean;
  /** Transcode the collectible's animated variant; needs ffmpeg in the image. */
  animatedNameplate: boolean;
  hideStatus: boolean;
  /** The presence dot on the avatar, independent of the custom status text. */
  hidePresence: boolean;
  hideTag: boolean;
  hideBadges: boolean;
  maxBadges: number;
  hidePlatform: boolean;
  hideNameplate: boolean;
  /** Apply Nitro display-name colors and effects. */
  nameStyles: boolean;
  hideBanner: boolean;
  showPronouns: boolean;
  showConnections: boolean;

  // --- activity ---
  hideActivity: HideActivity;
  hideTimestamp: boolean;
  hideSpotify: boolean;
  hideAppleMusic: boolean;
  ignoreAppId: string[];
  /** How many activities a layout may stack. */
  maxActivities: number;
  idleMessage: string;
}

const HEX = /^[0-9a-fA-F]{6}$/;
const SNOWFLAKE = /^\d{17,20}$/;

function choice<T extends string>(value: string | undefined, allowed: readonly T[], fallback: T): T {
  return allowed.includes(value as T) ? (value as T) : fallback;
}

function bool(value: string | undefined, fallback = false): boolean {
  if (value === undefined || value === "") return fallback;
  return value === "true" || value === "1";
}

function color(value: string | undefined): string | null {
  if (!value) return null;
  const normalized = value.startsWith("#") ? value.slice(1) : value;
  return HEX.test(normalized) ? `#${normalized}` : null;
}

function clampInt(value: string | undefined, min: number, max: number, fallback: number): number {
  // cnrad accepts CSS lengths like "10px"; take the leading number and clamp it.
  const parsed = Number.parseInt(String(value ?? ""), 10);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.min(max, Math.max(min, parsed));
}

/** Free text is capped and stripped of control characters before it reaches the card. */
function plain(value: string | undefined, max: number, fallback: string): string {
  if (!value) return fallback;
  const cleaned = value.replace(/\p{Cc}/gu, "").trim();
  return cleaned ? cleaned.slice(0, max) : fallback;
}

/** `hideActivity` is tri-state upstream: true, false, or "whenNotUsed". */
function hideActivity(value: string | undefined): HideActivity {
  if (value === "whenNotUsed") return "whenNotUsed";
  return bool(value);
}

/** Only well-formed snowflakes survive; anything else would never match anyway. */
function idList(value: string | undefined): string[] {
  if (!value) return [];
  return value
    .split(",")
    .map((entry) => entry.trim())
    .filter((entry) => SNOWFLAKE.test(entry))
    .slice(0, 20);
}

/**
 * Deployment defaults come first, the request's own query wins. That keeps a
 * README embed down to a bare URL while still allowing a one-off override.
 */
export function parseCardParams(
  query: Record<string, string | undefined>,
  defaults: Record<string, string> = {},
): CardParams {
  const merged = { ...defaults, ...query };
  return parse(merged);
}

function parse(query: Record<string, string | undefined>): CardParams {
  return {
    theme: choice(query.theme, THEMES, "dark"),
    layout: choice(query.layout, LAYOUTS, "card"),
    bg: color(query.bg),
    accent: color(query.accent),
    borderRadius: clampInt(query.borderRadius ?? query.radius, 0, 40, 12),
    clanBackgroundColor: color(query.clanBackgroundColor),
    profileGradient: bool(query.profileGradient, true),

    showDisplayName: bool(query.showDisplayName, true),
    showUsername: bool(query.showUsername, true),
    hideProfile: bool(query.hideProfile),
    hideDecoration: bool(query.hideDecoration),
    animated: bool(query.animated, true),
    animatedDecoration: bool(query.animatedDecoration),
    animatedBanner: bool(query.animatedBanner),
    animatedNameplate: bool(query.animatedNameplate),
    hideStatus: bool(query.hideStatus),
    hidePresence: bool(query.hidePresence),
    hideTag: bool(query.hideTag ?? query.hideClan),
    hideBadges: bool(query.hideBadges),
    maxBadges: clampInt(query.maxBadges, 0, 12, 6),
    hidePlatform: bool(query.hidePlatform),
    hideNameplate: bool(query.hideNameplate),
    nameStyles: bool(query.nameStyles, true),
    hideBanner: bool(query.hideBanner),
    showPronouns: bool(query.showPronouns),
    showConnections: bool(query.showConnections),

    hideActivity: hideActivity(query.hideActivity),
    hideTimestamp: bool(query.hideTimestamp ?? query.hideElapsed),
    hideSpotify: bool(query.hideSpotify),
    hideAppleMusic: bool(query.hideAppleMusic),
    ignoreAppId: idList(query.ignoreAppId),
    maxActivities: clampInt(query.maxActivities, 1, 3, 1),
    idleMessage: plain(query.idleMessage, 64, "I'm not currently doing anything!"),
  };
}
