/**
 * SVG card rendering.
 *
 * The whole card is HTML inside a single `<foreignObject>` — the one idea worth
 * borrowing from cnrad's renderer, because it means layouts are flexbox instead
 * of hand-placed SVG coordinates. Adding a variant is a new entry in LAYOUTS,
 * not a new coordinate system.
 */
import type { CSSProperties, ReactNode } from "react";
import type { NormalizedActivity, NormalizedUser, PresencePayload } from "../lib/types.ts";
import type { CardParams } from "./params.ts";
import type { CardImages } from "./images.ts";
import { BRAND_PATHS, BRAND_VIEWBOX } from "./brands.ts";
import type { Selection } from "./select.ts";

/**
 * cnrad's stack, verbatim. There is no webfont involved: Century Gothic renders
 * where it is installed (Windows, macOS with Office) and everything else falls
 * through to the platform sans — which is what most readers actually see.
 */
const FONT_STACK =
  "'Century Gothic', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif";

const STATUS_COLORS = {
  online: "#23a55a",
  idle: "#f0b232",
  dnd: "#f23f43",
  offline: "#80848e",
} as const;

/**
 * Fixed section heights. The SVG viewport has to be sized before the browser
 * lays anything out, so every block that can appear has a known height and the
 * total is summed up front — otherwise content clips at the bottom edge.
 */
const NAMEPLATE_HEIGHT = 48;
const BADGE_ROW = 24;
const STATUS_ROW = 21;
const CARD_PADDING = 16;
const SECTION_GAP = 12;
const ACTIVITY_ART = 72;
const ACTIVITY_BOX = ACTIVITY_ART + 28;
const BIO_ROW = 18;
const CONNECTION_ROW = 22;
/** Stacked activities after the first are drawn smaller. */
const SECONDARY_ART = 52;
/** cnrad separates sections with a hairline instead of framing the card. */
const HAIRLINE = (dark: boolean) => `solid 0.5px ${dark ? "hsl(0, 0%, 100%, 10%)" : "hsl(0, 0%, 0%, 10%)"}`;

/** cnrad renders the guild tag in the system stack, not the Discord font. */
const TAG_FONT =
  "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif";

const ACTIVITY_LABELS: Record<string, string> = {
  playing: "Playing",
  streaming: "Streaming",
  listening: "Listening to",
  watching: "Watching",
  competing: "Competing in",
  unknown: "Active",
};

/**
 * Nitro display-name fonts are webfonts. An SVG behind GitHub's proxy cannot
 * load one, and substituting a generic family (fantasy, cursive) produces a
 * different wrong typeface rather than an approximation — so only the colors
 * and effects are applied. Embedding the real font files is the upgrade path.
 * ponytail: colors+effects only, embed base64 subsets if the font matters
 */

/** Precomputed instead of CSS color-mix(), which not every SVG renderer supports. */
function mix(color: string, target: string, amount: number): string {
  const parse = (value: string) => [1, 3, 5].map((i) => Number.parseInt(value.slice(i, i + 2), 16));
  const [r1 = 0, g1 = 0, b1 = 0] = parse(color);
  const [r2 = 0, g2 = 0, b2 = 0] = parse(target);
  const blend = (a: number, b: number) => Math.round(a * (1 - amount) + b * amount);
  return `#${[blend(r1, r2), blend(g1, g2), blend(b1, b2)]
    .map((c) => c.toString(16).padStart(2, "0"))
    .join("")}`;
}

interface Palette {
  /** Flat colour behind the card, used where a gradient cannot be drawn. */
  base: string;
  background: string;
  surface: string;
  text: string;
  muted: string;
  subtle: string;
  accent: string;
  border: string;
  dark: boolean;
}

function palette(params: CardParams, payload: PresencePayload): Palette {
  const dark = params.theme !== "light";
  const accent =
    params.accent ?? payload.user.accentColor ?? payload.profile?.themeColors?.[0] ?? "#5865f2";
  const base = dark ? "#1a1c1f" : "#ffffff";

  // The Nitro profile gradient, when asked for, replaces the flat background.
  // Profile colors are picked for a Discord card, not for white text on top of
  // them — mixing them toward the dark base keeps the hue but restores contrast.
  const gradient = payload.profile?.themeColors;
  const tinted = gradient
    ? [mix(gradient[0], "#101114", 0.28), mix(gradient[1], "#101114", 0.52)]
    : null;
  const background =
    params.bg ??
    (params.profileGradient && tinted
      ? `linear-gradient(135deg, ${tinted[0]} 0%, ${tinted[1]} 100%)`
      : base);

  const flatBase =
    params.bg ?? (params.profileGradient && tinted ? tinted[0]! : base);

  return {
    base: flatBase,
    background,
    surface: params.profileGradient && gradient ? "rgba(0,0,0,0.32)" : dark ? "#25282c" : "#f2f3f5",
    text: dark || params.profileGradient ? "#f2f3f5" : "#111214",
    muted: dark || params.profileGradient ? "#b5bac1" : "#4e5058",
    subtle: dark || params.profileGradient ? "#9aa0a6" : "#6d6f78",
    accent,
    border: dark ? "#2e3135" : "#e3e5e8",
    dark,
  };
}

/** Nitro effect_id styling: 1 solid · 2 gradient · 3 neon · 4 toon · 5 pop · 6 glow. */
function nameStyle(user: NormalizedUser, params: CardParams, colors: Palette): CSSProperties {
  const styles = user.displayNameStyles;
  if (!params.nameStyles || !styles || styles.colors.length === 0) return { color: colors.text };

  const color1 = styles.colors[0]!;
  const color2 = styles.colors[1] ?? color1;
  const family: CSSProperties = {};

  const gradientText = (angle: string, mid: string): CSSProperties => ({
    ...family,
    color: color1, // fallback when background-clip:text is unavailable
    backgroundImage: `linear-gradient(${angle}, ${mix(color1, "#ffffff", 0.25)} 0%, ${mid} 45%, ${color2} 100%)`,
    WebkitBackgroundClip: "text",
    backgroundClip: "text",
    WebkitTextFillColor: "transparent",
  });

  switch (styles.effectId) {
    case 2:
      return gradientText("180deg", color1);
    case 3:
      return {
        ...family,
        color: color1,
        textShadow: `0 0 2px ${mix(color1, "#ffffff", 0.7)}, 0 0 6px ${color1}, 0 0 12px ${mix(color2, "#ffffff", 0.2)}`,
      };
    case 4:
      return { ...gradientText("180deg", color1), WebkitTextStroke: "0.6px rgba(71,33,11,0.38)" };
    case 5:
      return { ...family, color: color1, textShadow: `1.5px 1.5px 0 ${color2}` };
    case 6:
      return gradientText("135deg", color1);
    default:
      return { ...family, color: color1 };
  }
}

function formatElapsed(seconds: number): string {
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const secs = seconds % 60;
  const pad = (n: number) => String(n).padStart(2, "0");
  return hours > 0 ? `${hours}:${pad(minutes)}:${pad(secs)}` : `${pad(minutes)}:${pad(secs)}`;
}

/**
 * Discord's three activity lines mean different things per type — for music
 * `details` is the track and `state` the artist, for games they are free-form.
 */
function activityLines(activity: NormalizedActivity): { heading: string; lines: string[] } {
  const label = ACTIVITY_LABELS[activity.type] ?? "Active";
  return {
    heading: `${label} ${activity.name}`,
    lines: [activity.details, activity.state].filter((line): line is string => !!line),
  };
}

function Truncated({ children, style }: { children: ReactNode; style?: CSSProperties }) {
  return (
    <p
      style={{
        margin: "0",
        overflow: "hidden",
        whiteSpace: "nowrap",
        textOverflow: "ellipsis",
        ...style,
      }}
    >
      {children}
    </p>
  );
}

function Avatar({
  images,
  payload,
  params,
  colors,
  size,
}: {
  images: CardImages;
  payload: PresencePayload;
  params: CardParams;
  colors: Palette;
  size: number;
}) {
  // cnrad's ratio: a 13px dot on a 50px avatar, ringed in the card colour.
  const dot = Math.min(14, Math.round(size * 0.26));
  const inset = Math.round(size * 0.03);
  return (
    <div
      style={{
        position: "relative",
        width: `${size}px`,
        height: `${size}px`,
        display: "flex",
        flexShrink: 0,
      }}
    >
      {images.avatar ? (
        <img
          src={images.avatar}
          alt=""
          style={{ width: `${size}px`, height: `${size}px`, borderRadius: "50%" }}
        />
      ) : (
        <div
          style={{
            width: `${size}px`,
            height: `${size}px`,
            borderRadius: "50%",
            background: colors.surface,
          }}
        />
      )}
      {images.decoration ? (
        <img
          src={images.decoration}
          alt=""
          style={{
            position: "absolute",
            left: `${-size * 0.13}px`,
            top: `${-size * 0.13}px`,
            width: `${size * 1.26}px`,
            height: `${size * 1.26}px`,
          }}
        />
      ) : null}
      {/* hideStatus hides the custom status text, not the presence dot — cnrad
          draws the dot unconditionally and so do we. */}
      {!params.hidePresence ? (
        <div
          style={{
            position: "absolute",
            right: `${inset}px`,
            bottom: `${inset}px`,
            width: `${dot}px`,
            height: `${dot}px`,
            borderRadius: "50%",
            background: STATUS_COLORS[payload.presence.status],
            border: `3px solid ${colors.base}`,
            boxSizing: "content-box",
          }}
        />
      ) : null}
    </div>
  );
}

/** Stroked client glyphs, matching the production Glance widget. */
const PLATFORM_PATHS: Record<string, ReactNode> = {
  desktop: (
    <>
      <rect x="3.5" y="4.5" width="17" height="11" rx="1.75" />
      <path d="M8 19.5h8" />
      <path d="M12 15.5v4" />
    </>
  ),
  mobile: (
    <>
      <rect x="7" y="3.5" width="10" height="17" rx="2.2" />
      <path d="M11 6.25h2" />
      <circle cx="12" cy="17.25" r="0.8" fill="currentColor" stroke="none" />
    </>
  ),
  web: (
    <>
      <circle cx="12" cy="12" r="8.5" />
      <path d="M3.8 12h16.4" />
      <path d="M12 3.5c2.45 2.35 3.85 5.23 3.85 8.5S14.45 18.15 12 20.5c-2.45-2.35-3.85-5.23-3.85-8.5S9.55 5.85 12 3.5z" />
    </>
  ),
  embedded: (
    <>
      <path d="M7 9.5h10a3.5 3.5 0 0 1 0 7H7a3.5 3.5 0 0 1 0-7z" />
      <path d="M8.25 13H8.26" />
      <path d="M15.75 12.15l2.1 2.1" />
      <path d="M17.85 12.15l-2.1 2.1" />
    </>
  ),
  vr: (
    <>
      <path d="M4 10.5A2.5 2.5 0 0 1 6.5 8h11A2.5 2.5 0 0 1 20 10.5v3A2.5 2.5 0 0 1 17.5 16h-1.25l-1.9-2.2a3 3 0 0 0-4.7 0L7.75 16H6.5A2.5 2.5 0 0 1 4 13.5z" />
      <path d="M9.5 12.25h.01" />
      <path d="M14.5 12.25h.01" />
    </>
  ),
};

/** Drawn inline so nothing has to be fetched for them. */
function PlatformIcons({
  payload,
  params,
  colors,
}: {
  payload: PresencePayload;
  params: CardParams;
  colors: Palette;
}) {
  if (params.hidePlatform) return null;
  const active = Object.entries(payload.presence.platforms)
    .filter(([, on]) => on)
    .map(([name]) => name);
  if (active.length === 0) return null;

  return (
    <div style={{ display: "flex", flexDirection: "row", gap: "4px", alignItems: "center" }}>
      {active.map((name) => (
        <svg
          key={name}
          // The document is parsed as XML: inside the XHTML subtree an <svg>
          // without its own namespace is not an SVG element and renders nothing.
          xmlns="http://www.w3.org/2000/svg"
          width="15"
          height="15"
          viewBox="0 0 24 24"
          fill="none"
          stroke={colors.accent}
          strokeWidth="1.9"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          {PLATFORM_PATHS[name]}
        </svg>
      ))}
    </div>
  );
}

/** Connected accounts as brand marks; unknown services are skipped, not guessed. */
function Connections({
  payload,
  colors,
  size = 16,
}: {
  payload: PresencePayload;
  colors: Palette;
  size?: number;
}) {
  const accounts = (payload.profile?.connectedAccounts ?? [])
    .filter((account) => BRAND_PATHS[account.type])
    .slice(0, 8);
  if (accounts.length === 0) return null;

  return (
    <div style={{ display: "flex", flexDirection: "row", gap: "7px", alignItems: "center" }}>
      {accounts.map((account) => (
        <svg
          key={account.type}
          xmlns="http://www.w3.org/2000/svg"
          width={size}
          height={size}
          viewBox={BRAND_VIEWBOX}
          fill={colors.muted}
        >
          <path d={BRAND_PATHS[account.type]} />
        </svg>
      ))}
    </div>
  );
}

function Badges({ images, size = 20 }: { images: CardImages; size?: number }) {
  if (images.badges.length === 0) return null;
  return (
    <div style={{ display: "flex", flexDirection: "row", gap: "4px", alignItems: "center" }}>
      {images.badges.map((badge, index) => (
        <img key={index} src={badge} alt="" style={{ width: `${size}px`, height: `${size}px` }} />
      ))}
    </div>
  );
}

/**
 * The collectible nameplate sits behind the name. Discord's animated variant is
 * a .webm, so the static render is used and tinted with the product gradient.
 */
/**
 * Palette colors per collectible. Discord names the palette but does not publish
 * its color, so these are grounded in the Glance widget's stylesheet.
 * ponytail: one known palette, extend the map as plates actually show up
 */
const NAMEPLATE_PALETTES: Record<string, string> = {
  sky: "0, 128, 183",
};

const MASK = "linear-gradient(to right, rgba(0,0,0,0.3) calc(100% - 50px), rgb(0,0,0) 100%)";

/**
 * Nameplate treatment taken from the production Glance widget: the collectible
 * product's `background_colors` as a 135° gradient, the artwork masked on top so
 * it dissolves before it reaches the name, and an inset ring only when there is
 * no artwork to carry the edge.
 */
function Nameplate({
  payload,
  params,
  images,
  colors,
  children,
  width,
}: {
  payload: PresencePayload;
  params: CardParams;
  images: CardImages;
  colors: Palette;
  children: ReactNode;
  width: number;
}) {
  const plate = payload.user.nameplate;
  if (params.hideNameplate || !plate) {
    return (
      <div
        style={{ display: "flex", flexDirection: "column", justifyContent: "center", gap: "2px" }}
      >
        {children}
      </div>
    );
  }

  /*
   * The palette wins over the product's `background_colors`. Those are the shop
   * listing's colors — Koi Pond lists violet and pink while its artwork is a
   * teal pond, and painting the plate in them clashes with the art. The Glance
   * widget ends up doing the same thing by accident: its palette rule sits after
   * the gradient rule in the stylesheet, so the tint wins there too.
   */
  /*
   * Values taken from Discord's own member list, where the plate renders as:
   *   background: linear-gradient(90deg, transparent 0%, rgba(0,128,183,.08) 20%,
   *                               rgba(0,128,183,.08) 50%, rgba(0,128,183,.2) 100%)
   * The tint is far subtler than it looks in the client — most of the colour
   * impression comes from the artwork, not from the fill behind it.
   */
  const rgb = plate.palette ? NAMEPLATE_PALETTES[plate.palette] : undefined;
  const background = rgb
    ? `linear-gradient(90deg, transparent 0%, rgba(${rgb}, 0.08) 20%, rgba(${rgb}, 0.08) 50%, rgba(${rgb}, 0.2) 100%)`
    : plate.colors
      ? `linear-gradient(90deg, transparent 0%, ${plate.colors[0]}22 50%, ${plate.colors[1]}33 100%)`
      : `rgba(${colors.dark ? "255, 255, 255" : "0, 0, 0"}, 0.08)`;

  return (
    <div
      style={{
        position: "relative",
        display: "flex",
        width: `${width}px`,
        height: `${NAMEPLATE_HEIGHT}px`,
        borderRadius: "12px",
        overflow: "hidden",
        background,
        boxShadow: images.nameplate
          ? undefined
          : `inset 0 0 0 1px rgba(${rgb ?? "127, 127, 127"}, 0.35)`,
      }}
    >
      {images.nameplate ? (
        <div
          style={{
            position: "absolute",
            inset: "0",
            display: "flex",
            overflow: "hidden",
            // Discord fades the art over a fixed 50px band at the right edge,
            // not over a share of the width: rgba(0,0,0,.3) → opaque.
            WebkitMaskImage: MASK,
            maskImage: MASK,
          }}
        >
          <img
            src={images.nameplate}
            alt=""
            style={{
              position: "absolute",
              right: "0px",
              top: "50%",
              height: "105%",
              width: "auto",
              minWidth: "100%",
              transform: "translateY(-50%)",
            }}
          />
        </div>
      ) : null}
      <div
        style={{
          position: "relative",
          display: "flex",
          flexDirection: "column",
          justifyContent: "center",
          gap: "2px",
          padding: "0 12px",
          width: "100%",
        }}
      >
        {children}
      </div>
    </div>
  );
}

interface BlockProps {
  activity: NormalizedActivity;
  params: CardParams;
  colors: Palette;
  large: string | null;
  small: string | null;
  artSize: number;
  width: number;
  compact?: boolean;
}

function ActivityBlock({
  activity,
  params,
  colors,
  large,
  small,
  artSize,
  width,
  compact = false,
}: BlockProps) {
  const { heading, lines } = activityLines(activity);
  const badge = Math.round(artSize * 0.24);

  return (
    <div style={{ display: "flex", flexDirection: "row", alignItems: "center", gap: "12px" }}>
      <div
        style={{
          position: "relative",
          width: `${artSize}px`,
          height: `${artSize}px`,
          display: "flex",
          flexShrink: 0,
        }}
      >
        <div
          style={{
            width: `${artSize}px`,
            height: `${artSize}px`,
            borderRadius: "8px",
            background: colors.surface,
            display: "flex",
          }}
        >
          {large ? (
            <img
              src={large}
              alt=""
              style={{ width: `${artSize}px`, height: `${artSize}px`, borderRadius: "8px" }}
            />
          ) : null}
        </div>
        {small ? (
          <img
            src={small}
            alt=""
            style={{
              position: "absolute",
              right: "-5px",
              bottom: "-5px",
              width: `${badge}px`,
              height: `${badge}px`,
              borderRadius: "50%",
              border: `2px solid ${colors.dark ? "#1a1c1f" : "#ffffff"}`,
            }}
          />
        ) : null}
      </div>

      <div
        style={{ display: "flex", flexDirection: "column", gap: "3px", width: `${width}px` }}
      >
        <Truncated
          style={{
            color: colors.accent,
            fontSize: compact ? "0.7rem" : "0.75rem",
            fontWeight: 700,
            textTransform: "uppercase",
            letterSpacing: "0.4px",
          }}
        >
          {heading}
        </Truncated>
        {lines[0] ? (
          <Truncated style={{ color: colors.text, fontSize: "0.85rem", fontWeight: 700 }}>
            {lines[0]}
          </Truncated>
        ) : null}
        {lines[1] ? (
          <Truncated style={{ color: colors.muted, fontSize: "0.85rem" }}>{lines[1]}</Truncated>
        ) : null}
        {!params.hideTimestamp ? <Timing activity={activity} colors={colors} /> : null}
      </div>
    </div>
  );
}

/**
 * Activities that report both a start and an end — Spotify, Apple Music, some
 * games — can show how far along they are. Everything else, a radio stream
 * included, only has a start, so it falls back to elapsed time.
 */
function Timing({ activity, colors }: { activity: NormalizedActivity; colors: Palette }) {
  const { start, end } = activity.timestamps;
  if (activity.elapsedSeconds === null) return null;

  if (!start || !end || end <= start) {
    return (
      <Truncated style={{ color: colors.subtle, fontSize: "0.85rem" }}>
        {formatElapsed(activity.elapsedSeconds)} elapsed
      </Truncated>
    );
  }

  const total = Math.floor((end - start) / 1000);
  const position = Math.min(activity.elapsedSeconds, total);
  const percent = Math.max(0, Math.min(100, (position / total) * 100));

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "4px", marginTop: "2px" }}>
      <div
        style={{
          display: "flex",
          height: "4px",
          borderRadius: "2px",
          background: colors.dark ? "rgba(255,255,255,0.16)" : "rgba(0,0,0,0.12)",
          overflow: "hidden",
        }}
      >
        <div style={{ display: "flex", width: `${percent}%`, background: colors.accent }} />
      </div>
      <div
        style={{
          display: "flex",
          flexDirection: "row",
          justifyContent: "space-between",
          color: colors.subtle,
          fontSize: "0.72rem",
        }}
      >
        <span>{formatElapsed(position)}</span>
        <span>{formatElapsed(total)}</span>
      </div>
    </div>
  );
}

function Idle({ params, colors }: { params: CardParams; colors: Palette }) {
  return (
    <div
      style={{ display: "flex", width: "100%", justifyContent: "center", alignItems: "center" }}
    >
      <p style={{ margin: "0", color: colors.subtle, fontSize: "13px", fontStyle: "italic" }}>
        {params.idleMessage}
      </p>
    </div>
  );
}

interface Metrics {
  showProfile: boolean;
  showBadges: boolean;
  showStatus: boolean;
  showActivity: boolean;
  showSecondary: boolean;
  showBio: boolean;
  showConnections: boolean;
  /** The handle line: only meaningful when the name above it differs. */
  showUsername: boolean;
  identityHeight: number;
  /** Total height of the stacked activity rows, gaps included. */
  activityHeight: number;
}

function metricsFor(
  payload: PresencePayload,
  params: CardParams,
  images: CardImages,
  selection: Selection,
): Metrics {
  const showProfile = !params.hideProfile;
  const custom = payload.presence.customStatus;
  const showBadges = showProfile && !params.hideBadges && images.badges.length > 0;
  const showStatus = showProfile && !params.hideStatus && !!custom?.text;
  const showActivity =
    params.hideActivity !== true &&
    !(params.hideActivity === "whenNotUsed" && !selection.primary);

  const showConnections =
    showProfile && params.showConnections && (payload.profile?.connectedAccounts.length ?? 0) > 0;

  // Without the display name above it, the handle *is* the name — printing it
  // twice is what cnrad avoids by tying the second line to showDisplayName.
  const showUsername = params.showUsername && params.showDisplayName;

  const stacked =
    NAMEPLATE_HEIGHT +
    (showBadges ? BADGE_ROW : 0) +
    (showStatus ? STATUS_ROW : 0) +
    (showConnections ? CONNECTION_ROW : 0);

  const rows = selection.visible.length;
  const activityHeight =
    rows === 0
      ? ACTIVITY_BOX
      : ACTIVITY_ART + 28 + (rows - 1) * (SECONDARY_ART + 10);

  return {
    showProfile,
    showBadges,
    showStatus,
    showActivity,
    showSecondary: showActivity && !!selection.secondary,
    showBio: showProfile && params.layout === "banner" && !!payload.profile?.bio,
    showConnections,
    showUsername,
    identityHeight: Math.max(stacked, 56),
    activityHeight,
  };
}

interface LayoutProps {
  payload: PresencePayload;
  params: CardParams;
  images: CardImages;
  colors: Palette;
  selection: Selection;
  metrics: Metrics;
}

function Identity({
  payload,
  params,
  images,
  colors,
  metrics,
  width,
  avatarSize,
  avatarOffset = 0,
}: LayoutProps & { width: number; avatarSize: number; avatarOffset?: number }) {
  const custom = payload.presence.customStatus;
  const name = params.showDisplayName ? payload.user.displayName : payload.user.username;

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "row",
        alignItems: "center",
        gap: "14px",
        height: `${metrics.identityHeight}px`,
      }}
    >
      <div style={{ display: "flex", marginTop: `${avatarOffset}px` }}>
        <Avatar images={images} payload={payload} params={params} colors={colors} size={avatarSize} />
      </div>
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          justifyContent: "center",
          width: `${width}px`,
          height: `${metrics.identityHeight}px`,
        }}
      >
        <Nameplate payload={payload} params={params} images={images} colors={colors} width={width}>
          <div style={{ display: "flex", flexDirection: "row", alignItems: "center", gap: "6px" }}>
            <Truncated
              style={{ fontSize: "18px", fontWeight: 700, ...nameStyle(payload.user, params, colors) }}
            >
              {name}
            </Truncated>
            {payload.user.clan && !params.hideTag ? (
              <span
                style={{
                  display: "flex",
                  flexDirection: "row",
                  alignItems: "center",
                  gap: "3px",
                  background: params.clanBackgroundColor ?? "rgba(255,255,255,0.14)",
                  color: colors.text,
                  fontSize: "12px",
                  fontWeight: 600,
                  fontFamily: TAG_FONT,
                  padding: "1px 6px",
                  borderRadius: "6px",
                  whiteSpace: "nowrap",
                  lineHeight: "1.4",
                }}
              >
                {images.clanBadge ? (
                  <img src={images.clanBadge} alt="" style={{ width: "14px", height: "14px" }} />
                ) : null}
                {payload.user.clan.tag}
              </span>
            ) : null}
            <PlatformIcons payload={payload} params={params} colors={colors} />
          </div>
          {metrics.showUsername ? (
            <Truncated style={{ color: colors.text, fontSize: "0.95rem", fontWeight: 400 }}>
              {payload.user.username}
              {params.showPronouns && payload.profile?.pronouns
                ? ` · ${payload.profile.pronouns}`
                : ""}
            </Truncated>
          ) : null}
        </Nameplate>

        {metrics.showStatus ? (
          <div
            style={{
              display: "flex",
              flexDirection: "row",
              alignItems: "center",
              gap: "5px",
              height: `${STATUS_ROW}px`,
            }}
          >
            {images.statusEmoji ? (
              <img src={images.statusEmoji} alt="" style={{ width: "15px", height: "15px" }} />
            ) : null}
            <Truncated style={{ color: colors.muted, fontSize: "13px" }}>
              {custom?.text ?? ""}
            </Truncated>
          </div>
        ) : null}

        {metrics.showBadges ? (
          <div style={{ display: "flex", alignItems: "center", height: `${BADGE_ROW}px` }}>
            <Badges images={images} />
          </div>
        ) : null}

        {metrics.showConnections ? (
          <div style={{ display: "flex", alignItems: "center", height: `${CONNECTION_ROW}px` }}>
            <Connections payload={payload} colors={colors} />
          </div>
        ) : null}
      </div>
    </div>
  );
}

/** Portrait card: identity on top, activity below. Closest to the familiar widget. */
function CardLayout(props: LayoutProps) {
  const { params, colors, selection, images, metrics } = props;

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        gap: `${SECTION_GAP}px`,
        padding: `${CARD_PADDING}px`,
        width: "100%",
      }}
    >
      {metrics.showProfile ? <Identity {...props} width={276} avatarSize={56} /> : null}
      {metrics.showActivity ? (
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            gap: "10px",
            paddingTop: `${SECTION_GAP}px`,
            borderTop: metrics.showProfile ? HAIRLINE(colors.dark) : "none",
            height: `${metrics.activityHeight}px`,
            boxSizing: "border-box",
            justifyContent: "center",
          }}
        >
          {selection.visible.length > 0 ? (
            selection.visible.map((item, index) => (
              <ActivityBlock
                key={`${item.name}-${index}`}
                activity={item}
                params={params}
                colors={colors}
                large={index === 0 ? images.activityLarge : images.secondaryLarge}
                small={index === 0 ? images.activitySmall : null}
                artSize={index === 0 ? ACTIVITY_ART : SECONDARY_ART}
                width={index === 0 ? 252 : 272}
                compact={index > 0}
              />
            ))
          ) : (
            <Idle params={params} colors={colors} />
          )}
        </div>
      ) : null}
    </div>
  );
}

/** Flat single row: fits above a README heading without eating vertical space. */
function WideLayout(props: LayoutProps) {
  const { params, colors, selection, images, metrics } = props;
  const activity = selection.primary;

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "row",
        alignItems: "center",
        gap: "18px",
        padding: `${CARD_PADDING}px ${CARD_PADDING + 4}px`,
        width: "100%",
      }}
    >
      {metrics.showProfile ? (
        <>
          <Identity {...props} width={232} avatarSize={52} />
          <div
            style={{
              width: "0px",
              height: `${metrics.identityHeight - 8}px`,
              borderLeft: HAIRLINE(colors.dark),
              display: "flex",
              flexShrink: 0,
            }}
          />
        </>
      ) : null}

      {metrics.showActivity ? (
        activity ? (
          <ActivityBlock
            activity={activity}
            params={params}
            colors={colors}
            large={images.activityLarge}
            small={images.activitySmall}
            artSize={56}
            width={metrics.showProfile ? 245 : 590}
            compact
          />
        ) : (
          <Idle params={params} colors={colors} />
        )
      ) : null}
    </div>
  );
}

/** Banner variant: profile banner up top, nameplate behind the name, activity below. */
function BannerLayout(props: LayoutProps) {
  const { payload, params, colors, selection, images, metrics } = props;
  const bannerColor = payload.user.bannerColor ?? colors.accent;

  return (
    <div style={{ display: "flex", flexDirection: "column", width: "100%" }}>
      <div
        style={{
          display: "flex",
          height: "90px",
          width: "100%",
          background: bannerColor,
          overflow: "hidden",
        }}
      >
        {images.banner ? (
          <img
            src={images.banner}
            alt=""
            style={{ width: "100%", height: "90px", objectFit: "cover" }}
          />
        ) : null}
      </div>

      <div
        style={{
          display: "flex",
          flexDirection: "column",
          gap: "12px",
          padding: "12px 20px 18px 20px",
          width: "100%",
        }}
      >
        {metrics.showProfile ? (
          <Identity {...props} width={340} avatarSize={72} avatarOffset={-40} />
        ) : null}

        {metrics.showBio ? (
          <Truncated style={{ color: colors.muted, fontSize: "12px", height: `${BIO_ROW}px` }}>
            {payload.profile?.bio}
          </Truncated>
        ) : null}

        {metrics.showActivity ? (
          <div
            style={{
              display: "flex",
              flexDirection: "column",
              gap: "10px",
              paddingTop: "12px",
              borderTop: metrics.showProfile ? HAIRLINE(colors.dark) : "none",
              width: "100%",
            }}
          >
            {selection.visible.length > 0 ? (
              selection.visible.map((item, index) => (
                <ActivityBlock
                  key={`${item.name}-${index}`}
                  activity={item}
                  params={params}
                  colors={colors}
                  large={index === 0 ? images.activityLarge : images.secondaryLarge}
                  small={index === 0 ? images.activitySmall : null}
                  artSize={index === 0 ? 56 : 40}
                  width={index === 0 ? 380 : 396}
                  compact={index > 0}
                />
              ))
            ) : (
              <Idle params={params} colors={colors} />
            )}
          </div>
        ) : null}
      </div>
    </div>
  );
}

const LAYOUTS = {
  card: { component: CardLayout, width: 400, height: 218 },
  wide: { component: WideLayout, width: 700, height: 88 },
  banner: { component: BannerLayout, width: 500, height: 320 },
} as const;

/** Sections that are switched off must not leave the card floating in empty space. */
function dimensions(params: CardParams, metrics: Metrics): { width: number; height: number } {
  const { width, height } = LAYOUTS[params.layout];

  if (params.layout === "card") {
    const sections: number[] = [];
    if (metrics.showProfile) sections.push(metrics.identityHeight);
    if (metrics.showActivity) sections.push(metrics.activityHeight);
    const gaps = Math.max(0, sections.length - 1) * SECTION_GAP;
    const total = sections.reduce((sum, value) => sum + value, 0);
    return { width, height: CARD_PADDING * 2 + total + gaps };
  }
  if (params.layout === "wide") {
    const tallest = Math.max(
      metrics.showProfile ? metrics.identityHeight : 0,
      metrics.showActivity ? 56 : 0,
    );
    return { width, height: tallest + CARD_PADDING * 2 };
  }
  if (params.layout === "banner") {
    const bannerHeight = params.hideBanner ? 0 : 90;
    const sections = [metrics.showProfile ? metrics.identityHeight : 0];
    if (metrics.showBio) sections.push(BIO_ROW);
    if (metrics.showActivity) sections.push(metrics.activityHeight - 16);
    const used = sections.filter(Boolean);
    const gaps = Math.max(0, used.length - 1) * SECTION_GAP;
    const overlap = params.hideBanner ? 0 : 40;
    const total = used.reduce((sum, value) => sum + value, 0);
    return { width, height: bannerHeight - overlap + total + gaps + CARD_PADDING + 8 };
  }
  return { width, height };
}

export function renderCard(
  payload: PresencePayload,
  params: CardParams,
  images: CardImages,
  selection: Selection,
): ReactNode {
  const colors = palette(params, payload);
  const { component: Layout } = LAYOUTS[params.layout];
  const metrics = metricsFor(payload, params, images, selection);
  const { width, height } = dimensions(params, metrics);

  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width={width}
      height={height}
      viewBox={`0 0 ${width} ${height}`}
      role="img"
      aria-label={`Discord presence of ${payload.user.displayName}`}
    >
      <foreignObject x="0" y="0" width={width} height={height}>
        <div
          // @ts-expect-error -- xmlns is required on the XHTML root inside foreignObject
          xmlns="http://www.w3.org/1999/xhtml"
          style={{
            width: `${width}px`,
            height: `${height}px`,
            boxSizing: "border-box",
            display: "flex",
            position: "relative",
            fontFamily: FONT_STACK,
            fontSize: "16px",
            background: colors.background,
            borderRadius: `${params.borderRadius}px`,
            overflow: "hidden",
          }}
        >
          <Layout
            payload={payload}
            params={params}
            images={images}
            colors={colors}
            selection={selection}
            metrics={metrics}
          />
        </div>
      </foreignObject>
    </svg>
  );
}

export const CARD_DIMENSIONS = LAYOUTS;
