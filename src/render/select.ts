/**
 * Which activity a card leads with.
 *
 * Kept separate from rendering because every consumer needs the same order:
 * a game outranks music, music outranks anything else, and a second music
 * session shows below the primary block instead of replacing it — the behaviour
 * the Glance widget settled on.
 */
import type { NormalizedActivity, NormalizedPresence } from "../lib/types.ts";
import type { CardParams } from "./params.ts";

const SPOTIFY_APP_ID = "spotify:1";

function isSpotify(activity: NormalizedActivity): boolean {
  return activity.name.toLowerCase() === "spotify" || activity.applicationId === SPOTIFY_APP_ID;
}

function isAppleMusic(activity: NormalizedActivity): boolean {
  return activity.name.toLowerCase().includes("apple music");
}

export interface Selection {
  primary: NormalizedActivity | null;
  /** A music session running alongside a game, shown as a second row. */
  secondary: NormalizedActivity | null;
  /** Primary first, then the rest, capped by `maxActivities`. */
  visible: NormalizedActivity[];
}

export function selectActivities(presence: NormalizedPresence, params: CardParams): Selection {
  if (params.hideActivity === true) return { primary: null, secondary: null, visible: [] };

  const visible = presence.activities.filter((activity) => {
    if (activity.applicationId && params.ignoreAppId.includes(activity.applicationId)) return false;
    if (params.hideSpotify && isSpotify(activity)) return false;
    if (params.hideAppleMusic && isAppleMusic(activity)) return false;
    return true;
  });

  const game = visible.find((a) => a.type === "playing") ?? null;
  const music = visible.find((a) => a.type === "listening") ?? null;
  const primary = game ?? music ?? visible[0] ?? null;

  const ordered = primary ? [primary, ...visible.filter((a) => a !== primary)] : [];
  return {
    primary,
    secondary: game && music && music !== primary ? music : null,
    visible: ordered.slice(0, params.maxActivities),
  };
}
