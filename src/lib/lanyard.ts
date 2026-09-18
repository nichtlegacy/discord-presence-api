/** Presence source: status, platforms and every activity including non-Spotify listening. */
import { fetchJson } from "./http.ts";

export interface LanyardActivity {
  type: number;
  name?: string;
  application_id?: string;
  details?: string;
  state?: string;
  details_url?: string;
  state_url?: string;
  buttons?: string[];
  emoji?: { id?: string; name?: string; animated?: boolean };
  assets?: {
    large_image?: string;
    large_text?: string;
    large_url?: string;
    small_image?: string;
    small_text?: string;
  };
  timestamps?: { start?: number; end?: number };
}

export interface LanyardData {
  kv?: Record<string, string>;
  discord_status?: string;
  active_on_discord_desktop?: boolean;
  active_on_discord_mobile?: boolean;
  active_on_discord_web?: boolean;
  active_on_discord_embedded?: boolean;
  active_on_discord_vr?: boolean;
  activities?: LanyardActivity[];
  discord_user?: {
    id?: string;
    username?: string;
    global_name?: string | null;
    display_name?: string | null;
    avatar?: string | null;
    avatar_decoration_data?: { asset?: string } | null;
    primary_guild?: { identity_guild_id?: string; tag?: string | null; badge?: string | null } | null;
    display_name_styles?: { font_id?: number; effect_id?: number; colors?: number[] } | null;
    collectibles?: {
      nameplate?: { asset?: string; palette?: string; sku_id?: string; label?: string } | null;
    } | null;
  };
}

export async function fetchLanyard(userId: string): Promise<LanyardData> {
  const body = await fetchJson<{ success?: boolean; data?: LanyardData; error?: unknown }>(
    `https://api.lanyard.rest/v1/users/${userId}`,
  );
  if (!body.success || !body.data) throw new Error("lanyard returned no data");
  return body.data;
}
