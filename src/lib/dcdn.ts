/**
 * Profile source: banner, bio, pronouns and connected accounts — fields Discord
 * only exposes through its user-profile endpoint, which bots cannot call.
 *
 * Third-party service, so every consumer treats this as optional: a failure here
 * costs decoration, never the presence itself.
 */
import { fetchJson } from "./http.ts";

export interface DcdnResponse {
  user?: {
    banner?: string | null;
    banner_color?: string | null;
    accent_color?: number | null;
  };
  user_profile?: {
    bio?: string | null;
    pronouns?: string | null;
    theme_colors?: number[] | null;
  };
  connected_accounts?: Array<{ type?: string; name?: string; verified?: boolean }>;
  badges?: Array<{ id?: string; description?: string; icon?: string }>;
  legacy_username?: string | null;
}

export async function fetchDcdn(userId: string): Promise<DcdnResponse> {
  return fetchJson<DcdnResponse>(`https://dcdn.dstn.to/profile/${userId}`);
}
