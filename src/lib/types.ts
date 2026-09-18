/** Normalized shapes served by this API. Neither upstream is exposed verbatim. */

export type DiscordStatus = "online" | "idle" | "dnd" | "offline";

export type ActivityType =
  | "playing"
  | "streaming"
  | "listening"
  | "watching"
  | "custom"
  | "competing"
  | "unknown";

export interface NormalizedActivity {
  type: ActivityType;
  /** Raw Discord activity type, kept so clients can implement their own priorities. */
  rawType: number;
  applicationId: string | null;
  name: string;
  details: string | null;
  state: string | null;
  largeText: string | null;
  smallText: string | null;
  images: { large: string | null; small: string | null };
  urls: { details: string | null; state: string | null; large: string | null };
  buttons: string[];
  timestamps: { start: number | null; end: number | null };
  /** Seconds since `timestamps.start`, null when the activity is untimed. */
  elapsedSeconds: number | null;
}

export interface NormalizedPresence {
  status: DiscordStatus;
  /** Every client Discord reports as active; order is the display order. */
  platforms: { desktop: boolean; mobile: boolean; web: boolean; embedded: boolean; vr: boolean };
  customStatus: { text: string | null; emoji: string | null; emojiName: string | null } | null;
  /** Every activity except the custom status, in Discord's own order. */
  activities: NormalizedActivity[];
  /** Convenience pointer to the activity a card should lead with. */
  primary: NormalizedActivity | null;
  listening: NormalizedActivity | null;
}

export interface NormalizedUser {
  id: string;
  username: string;
  displayName: string;
  avatar: string;
  avatarDecoration: string | null;
  banner: string | null;
  bannerColor: string | null;
  accentColor: string | null;
  clan: { tag: string; badge: string | null } | null;
  nameplate: {
    asset: string;
    palette: string | null;
    image: string | null;
    /** The animated variant, as .webm — needs transcoding before it can be shown. */
    video: string | null;
    /** Gradient Discord paints behind the plate; the artwork sits on top. */
    colors: [string, string] | null;
    label: string | null;
  } | null;
  displayNameStyles: { fontId: number; effectId: number; colors: string[] } | null;
}

export interface NormalizedProfile {
  bio: string | null;
  pronouns: string | null;
  connectedAccounts: Array<{ type: string; name: string; verified: boolean }>;
  themeColors: [string, string] | null;
  /**
   * Profile badges with their icon URLs. dcdn carries the icon hashes, which is
   * why Nitro and boosting badges are available here — Lanyard alone cannot see
   * them, the limitation renderers built on it run into.
   */
  badges: Array<{ id: string; description: string; icon: string | null }>;
  legacyUsername: string | null;
}

export interface PresencePayload {
  user: NormalizedUser;
  /** Null when dcdn is disabled or unreachable — the card degrades, it does not fail. */
  profile: NormalizedProfile | null;
  presence: NormalizedPresence;
  meta: {
    sources: { lanyard: boolean; dcdn: boolean };
    fetchedAt: string;
    /** Lanyard's per-user key/value store, passed through untouched. */
    kv: Record<string, string>;
  };
}
