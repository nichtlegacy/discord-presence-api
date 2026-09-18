/**
 * Collectible nameplate metadata.
 *
 * `styles.background_colors` is the gradient Discord paints behind the plate —
 * for "Koi Pond" violet to pink, with the teal artwork masked on top. Lanyard
 * reports only the asset path and palette name, so this record is the source.
 * Once minted a product never changes, so this caches for a day.
 */
import { config } from "../config.ts";
import { TtlCache } from "./cache.ts";
import { fetchJson } from "./http.ts";

interface ProductResponse {
  name?: string;
  styles?: { background_colors?: number[] };
}

export interface NameplateStyle {
  name: string | null;
  colors: [string, string] | null;
}

function hex(value: unknown): string | null {
  if (typeof value !== "number" || !Number.isFinite(value) || value < 0) return null;
  return `#${Math.floor(value).toString(16).padStart(6, "0")}`;
}

const cache = new TtlCache<NameplateStyle>(32);

export async function fetchNameplateStyle(skuId: string): Promise<NameplateStyle> {
  // The SKU reaches us from upstream JSON and goes into a URL path.
  if (!/^\d{17,20}$/.test(skuId)) return { name: null, colors: null };

  return cache.wrap(skuId, config.ttl.collectible, async () => {
    try {
      const product = await fetchJson<ProductResponse>(
        `https://discord.com/api/v10/collectibles-products/${skuId}`,
      );
      const colors = (product.styles?.background_colors ?? [])
        .map(hex)
        .filter((c): c is string => !!c);
      return {
        name: typeof product.name === "string" ? product.name.slice(0, 40) : null,
        colors: colors.length >= 2 ? [colors[0]!, colors[1]!] : null,
      };
    } catch {
      return { name: null, colors: null };
    }
  });
}
