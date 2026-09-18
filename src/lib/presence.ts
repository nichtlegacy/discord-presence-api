/**
 * Composition of the upstreams behind one cache each: presence moves every
 * minute, the profile barely moves at all, and a collectible never moves once
 * minted — so all three expire on different clocks.
 */
import { config } from "../config.ts";
import { TtlCache } from "./cache.ts";
import { fetchNameplateStyle } from "./collectibles.ts";
import { fetchDcdn, type DcdnResponse } from "./dcdn.ts";
import { fetchLanyard, type LanyardData } from "./lanyard.ts";
import { buildPayload, type UserOptions } from "./normalize.ts";
import type { PresencePayload } from "./types.ts";

const lanyardCache = new TtlCache<LanyardData>(64);
const dcdnCache = new TtlCache<DcdnResponse | null>(64);

/** dcdn is a third-party mirror; losing it costs decoration, never the card. */
async function loadDcdn(userId: string): Promise<DcdnResponse | null> {
  if (!config.enableDcdn) return null;
  return dcdnCache.wrap(userId, config.ttl.profile, async () => {
    try {
      return await fetchDcdn(userId);
    } catch {
      return null;
    }
  });
}

export interface PresenceOptions {
  animatedAvatar?: boolean;
  animatedDecoration?: boolean;
  animatedBanner?: boolean;
}

export async function getPresence(
  userId: string,
  options: PresenceOptions = {},
): Promise<PresencePayload> {
  const [lanyard, dcdn] = await Promise.all([
    lanyardCache.wrap(userId, config.ttl.presence, () => fetchLanyard(userId)),
    loadDcdn(userId),
  ]);

  // The nameplate gradient and name live in a separate product record, keyed by SKU.
  const skuId = lanyard.discord_user?.collectibles?.nameplate?.sku_id;
  const nameplate = skuId ? await fetchNameplateStyle(skuId) : null;

  const userOptions: UserOptions = {
    ...options,
    nameplateColors: nameplate?.colors ?? null,
    nameplateLabel: nameplate?.name ?? null,
  };

  return buildPayload(lanyard, dcdn, userOptions);
}
