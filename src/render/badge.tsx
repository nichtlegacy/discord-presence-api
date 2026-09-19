/**
 * Standalone view-count badge, shaped like a shieldcn badge.
 *
 * Measured off shieldcn's own output rather than guessed, so it sits in a row
 * with them without a seam: 32px tall, 6px corners, one solid fill and no
 * border, 12px of padding, a 16px logo, then white 14px text. `size=sm` and the
 * default render identically there, so there is no size knob to mirror.
 *
 * Like the card, the content is HTML inside a `<foreignObject>`: the pill is
 * laid out by flexbox and the only number that has to be guessed up front is the
 * outer width. Guessing it high just widens the padding evenly; guessing a
 * `<text>` offset high would misplace the count.
 */
import type { ReactNode } from "react";
import { choice, clampInt, color, plain } from "./params.ts";

/** shieldcn's stack, not the card's Century Gothic. */
const BADGE_FONT =
  "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif";

const HEIGHT = 32;
const PADDING_X = 12;
/** shieldcn leaves 7px between a 16px logo and the first glyph. */
const ICON = 16;
const ICON_GAP = 7;
const TEXT_GAP = 6;
const FONT_SIZE = 14;

/** Discord blurple, the way shieldcn's `variant=branded` uses a brand's own colour. */
const DEFAULT_FILL = "#5865f2";

/**
 * Glyphs, drawn rather than fetched. All stroked on a 24 viewBox so one set of
 * stroke attributes covers them; `bars` carries a little more weight because
 * three short strokes read lighter than a closed shape at 16px.
 */
const ICONS: Record<string, { paths: ReactNode; strokeWidth?: number }> = {
  bars: {
    paths: (
      <>
        <path d="M5 20v-6" />
        <path d="M12 20V9" />
        <path d="M19 20V4" />
      </>
    ),
    strokeWidth: 2.6,
  },
  eye: {
    paths: (
      <>
        <path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7-10-7-10-7z" />
        <circle cx="12" cy="12" r="3" />
      </>
    ),
  },
  pulse: { paths: <path d="M2 12h5l2.5-7 4 14 2.5-7h6" /> },
  trend: {
    paths: (
      <>
        <path d="M3 17l6-6 4 4 7-7" />
        <path d="M17 8h4v4" />
      </>
    ),
  },
  user: {
    paths: (
      <>
        <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
        <circle cx="12" cy="7" r="4" />
      </>
    ),
  },
};

/** `none` drops the glyph and the gap that goes with it. */
export const ICON_NAMES = [...Object.keys(ICONS), "none"] as const;
export type IconName = (typeof ICON_NAMES)[number];

export interface BadgeParams {
  icon: IconName;
  fill: string;
  text: string;
  label: string;
  borderRadius: number;
}

export function parseBadgeParams(
  query: Record<string, string | undefined>,
  defaults: Record<string, string> = {},
): BadgeParams {
  const merged = { ...defaults, ...query };
  return {
    icon: choice(merged.icon, ICON_NAMES, "bars"),
    fill: color(merged.color) ?? DEFAULT_FILL,
    text: color(merged.textColor) ?? "#ffffff",
    label: plain(merged.label, 32, "Profile Views"),
    borderRadius: clampInt(merged.borderRadius ?? merged.radius, 0, HEIGHT / 2, 6),
  };
}

/** Thousands separators, so a five-digit count stays readable at 14px. */
export function formatViews(count: number): string {
  return new Intl.NumberFormat("en-US").format(count);
}

/**
 * Advance widths for the stack above, as fractions of the font size. Only ever
 * used to size the pill, so an over-estimate costs symmetric padding and an
 * under-estimate would clip — the buckets lean wide on purpose.
 */
function textWidth(text: string, size: number): number {
  let em = 0;
  for (const char of text) {
    if (/[ .,:;'!|]/.test(char)) em += 0.32;
    else if (/[ijlt]/.test(char)) em += 0.34;
    else if (/[mwMW]/.test(char)) em += 0.88;
    else if (/[A-Z0-9]/.test(char)) em += 0.64;
    else em += 0.58;
  }
  return Math.ceil(em * size);
}

function Icon({ name, color: stroke }: { name: IconName; color: string }): ReactNode {
  const glyph = ICONS[name];
  if (!glyph) return null;

  return (
    <svg
      // Parsed as XML: inside an XHTML subtree an <svg> without its own
      // namespace is not an SVG element and renders nothing.
      xmlns="http://www.w3.org/2000/svg"
      width={ICON}
      height={ICON}
      viewBox="0 0 24 24"
      fill="none"
      stroke={stroke}
      strokeWidth={glyph.strokeWidth ?? 2}
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      {glyph.paths}
    </svg>
  );
}

export function renderBadge(count: number, params: BadgeParams): ReactNode {
  const value = formatViews(count);
  const hasIcon = params.icon !== "none";
  const width =
    PADDING_X * 2 +
    (hasIcon ? ICON + ICON_GAP : 0) +
    TEXT_GAP +
    textWidth(params.label, FONT_SIZE) +
    textWidth(value, FONT_SIZE);

  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width={width}
      height={HEIGHT}
      viewBox={`0 0 ${width} ${HEIGHT}`}
      role="img"
      aria-label={`${value} ${params.label}`}
    >
      <foreignObject x="0" y="0" width={width} height={HEIGHT}>
        <div
          // @ts-expect-error -- xmlns is required on the XHTML root inside foreignObject
          xmlns="http://www.w3.org/1999/xhtml"
          style={{
            display: "flex",
            flexDirection: "row",
            alignItems: "center",
            justifyContent: "center",
            width: `${width}px`,
            height: `${HEIGHT}px`,
            boxSizing: "border-box",
            // Solid fill, no border: shieldcn badges carry no outline, and one
            // would read as a seam next to them.
            background: params.fill,
            borderRadius: `${params.borderRadius}px`,
            color: params.text,
            fontFamily: BADGE_FONT,
            fontSize: `${FONT_SIZE}px`,
            lineHeight: "1",
            whiteSpace: "nowrap",
            overflow: "hidden",
          }}
        >
          <Icon name={params.icon} color={params.text} />
          <span style={{ marginLeft: hasIcon ? `${ICON_GAP}px` : "0", fontWeight: 500 }}>
            {params.label}
          </span>
          <span style={{ marginLeft: `${TEXT_GAP}px`, fontWeight: 700 }}>{value}</span>
        </div>
      </foreignObject>
    </svg>
  );
}
