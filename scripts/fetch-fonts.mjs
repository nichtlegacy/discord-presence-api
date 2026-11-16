/**
 * Downloads the Nitro display-name fonts into `assets/fonts/`.
 *
 * The map below is read off Discord's web client: the `font_id` enum, the class
 * each id gets, and that class's `font-family`, weight and letter-spacing.
 * Every file is under the SIL Open Font License 1.1, which permits embedding and
 * redistribution as long as the licence travels with the font
 * (`assets/fonts/LICENSES.md`).
 *
 * Google Fonts serves a latin subset, a fraction of Discord's full files. The two
 * families Google does not carry are taken from Discord's client, where they ship
 * under the names Discord shows in its picker.
 *
 * Ids 1, 2, 5, 9 and 11 get no class in the client and render in gg sans, so the
 * card keeps its own font for them too.
 *
 * Run after changing the map: `npm run fonts`
 */
import { mkdir, writeFile } from "node:fs/promises";

/** font_id → source family, Discord's weight and letter-spacing (em). */
const FONTS = {
  3: { family: "Cherry Bomb One", weight: 400, spacing: 0.04 }, // Sakura
  4: { family: "Chicle", weight: 400 }, // Jellybean
  6: { family: "MuseoModerno", weight: 500, spacing: 0.01 }, // Modern
  7: { family: "Medieval", weight: 400, spacing: 0.02, discord: true }, // Néo-Castel
  8: { family: "Pixelify Sans", weight: 500, spacing: 0.02 }, // 8Bit
  10: { family: "Vampyre", weight: 400, spacing: 0.01, discord: true }, // Sinistre
  12: { family: "Zilla Slab", weight: 600, spacing: 0.03 }, // Tempo
  13: { family: "Playpen Sans", weight: 700 }, // Monkey Bars
  14: { family: "Orbitron", weight: 700, spacing: 0.03 }, // Mainframe
  15: { family: "New Rocker", weight: 400 }, // Headbang
  16: { family: "Kalam", weight: 700 }, // Journal
  // GTA VI's Pricedown is a commercial Typodermic face licensed to Discord alone;
  // Bungee is the closest OFL stand-in.
  17: { family: "Bungee", weight: 400 },
};

// Without a browser user agent Google serves TTF instead of woff2.
const UA =
  "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120 Safari/537.36";
const get = (url) => fetch(url, { headers: { "user-agent": UA } });

async function googleUrl(family, weight) {
  const query = `family=${family.replace(/ /g, "+")}:wght@${weight}&display=swap`;
  const css = await get(`https://fonts.googleapis.com/css2?${query}`).then((r) => r.text());
  // The API emits one @font-face per subset; pick latin.
  const blocks = css.split("@font-face").filter((b) => b.includes("src:"));
  const latin = blocks.find((b) => b.includes("U+0000-00FF")) ?? blocks.at(-1);
  return latin?.match(/https:\/\/fonts\.gstatic\.com\/[^)]+\.woff2/)?.[0];
}

/** Discord's @font-face rules live in one of a few hundred hashed stylesheets. */
let discordFaces;
async function discordUrl(family) {
  if (!discordFaces) {
    discordFaces = new Map();
    const html = await get("https://discord.com/app").then((r) => r.text());
    const sheets = [...new Set(html.match(/\/assets\/[\w.]+\.css/g) ?? [])];
    for (const sheet of sheets) {
      const css = await get(`https://discord.com${sheet}`).then((r) => r.text());
      for (const [, name, file] of css.matchAll(
        /@font-face\{[^}]*font-family:"?([^;"]+)"?;[^}]*src:url\("?(\/assets\/\w+\.woff2)/g,
      )) {
        discordFaces.set(name, `https://discord.com${file}`);
      }
      if (discordFaces.has("Pricedown")) break; // the name-font sheet is complete
    }
  }
  return discordFaces.get(family);
}

const dir = new URL("../assets/fonts/", import.meta.url);
await mkdir(dir, { recursive: true });

const index = {};

for (const [id, { family, weight, spacing, discord }] of Object.entries(FONTS)) {
  const url = discord ? await discordUrl(family) : await googleUrl(family, weight);
  if (!url) {
    console.warn(`no woff2 for ${family}`);
    continue;
  }

  const file = `${family.toLowerCase().replace(/ /g, "-")}.woff2`;
  const bytes = new Uint8Array(await get(url).then((r) => r.arrayBuffer()));
  await writeFile(new URL(file, dir), bytes);
  index[id] = { family, file, weight, ...(spacing ? { letterSpacing: `${spacing}em` } : {}) };
  console.log(`${family.padEnd(18)} ${String(bytes.byteLength).padStart(7)} bytes → ${file}`);
}

await writeFile(new URL("index.json", dir), `${JSON.stringify(index, null, 2)}\n`);
console.log(`\nwrote ${Object.keys(index).length} fonts`);
