/**
 * Colour decisions shared by the renderer and the image pipeline.
 *
 * The base colour lives here because two very different places need the same
 * answer: the card paints it, and the nameplate transcode composites the plate
 * artwork onto it. Discord ships that artwork as VP9 with an alpha channel, but
 * animated WebP cannot carry per-frame alpha — so the background has to be
 * baked in, and it has to match the card exactly.
 */
import type { PresencePayload } from "../lib/types.ts";
import type { CardParams } from "./params.ts";

/** Precomputed instead of CSS color-mix(), which not every SVG renderer supports. */
export function mix(color: string, target: string, amount: number): string {
  const parse = (value: string) => [1, 3, 5].map((i) => Number.parseInt(value.slice(i, i + 2), 16));
  const [r1 = 0, g1 = 0, b1 = 0] = parse(color);
  const [r2 = 0, g2 = 0, b2 = 0] = parse(target);
  const blend = (a: number, b: number) => Math.round(a * (1 - amount) + b * amount);
  return `#${[blend(r1, r2), blend(g1, g2), blend(b1, b2)]
    .map((c) => c.toString(16).padStart(2, "0"))
    .join("")}`;
}

/**
 * Profile colors are picked for a Discord card, not for white text on top of
 * them — mixing them toward the dark base keeps the hue but restores contrast.
 */
export function gradientStops(payload: PresencePayload): [string, string] | null {
  const colors = payload.profile?.themeColors;
  if (!colors) return null;
  return [mix(colors[0], "#101114", 0.28), mix(colors[1], "#101114", 0.52)];
}

/** The flat colour behind the card, used wherever a gradient cannot be drawn. */
export function baseColor(params: CardParams, payload: PresencePayload): string {
  if (params.bg) return params.bg;
  const gradient = params.profileGradient ? gradientStops(payload) : null;
  if (gradient) return gradient[0];
  return params.theme === "light" ? "#ffffff" : "#1a1c1f";
}
