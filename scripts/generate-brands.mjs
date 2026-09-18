/**
 * Regenerates `src/render/brands.ts` from the official simple-icons package.
 *
 * The paths are baked into the source rather than pulled at runtime: the card
 * must not depend on an external host, and simple-icons stays a devDependency
 * that never ships in the image.
 *
 * Run after adding a connection type: `node scripts/generate-brands.mjs`
 */
import { writeFile } from "node:fs/promises";
import * as icons from "simple-icons";

/** Discord connection type → simple-icons slug. */
const SERVICES = {
  battlenet: "siBattledotnet",
  bluesky: "siBluesky",
  bungie: "siBungie",
  crunchyroll: "siCrunchyroll",
  domain: "siGooglechrome",
  ebay: "siEbay",
  epicgames: "siEpicgames",
  facebook: "siFacebook",
  github: "siGithub",
  instagram: "siInstagram",
  leagueoflegends: "siLeagueoflegends",
  mastodon: "siMastodon",
  paypal: "siPaypal",
  playstation: "siPlaystation",
  reddit: "siReddit",
  riotgames: "siRiotgames",
  roblox: "siRoblox",
  skype: "siSkype",
  spotify: "siSpotify",
  steam: "siSteam",
  tiktok: "siTiktok",
  twitch: "siTwitch",
  twitter: "siX",
  xbox: "siXbox",
  youtube: "siYoutube",
};

const entries = [];
const missing = [];

for (const [type, slug] of Object.entries(SERVICES)) {
  const icon = icons[slug];
  if (!icon) {
    missing.push(`${type} (${slug})`);
    continue;
  }
  entries.push(`  // ${icon.title}\n  ${type}:\n    "${icon.path}",`);
}

if (missing.length > 0) {
  console.warn("no simple-icons entry for:", missing.join(", "));
}

const source = `/**
 * Brand marks for connected accounts, keyed by Discord's connection type.
 *
 * Generated from the official simple-icons package by
 * \`scripts/generate-brands.mjs\` — do not edit by hand. Paths are monochrome
 * and inlined, so the card never reaches out to an icon host at render time.
 */
export const BRAND_PATHS: Record<string, string> = {
${entries.join("\n")}
};

/** simple-icons draws on a 24-unit grid. */
export const BRAND_VIEWBOX = "0 0 24 24";
`;

await writeFile(new URL("../src/render/brands.ts", import.meta.url), source);
console.log(`wrote ${entries.length} brand marks`);
