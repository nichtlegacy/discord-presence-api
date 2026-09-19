/**
 * Downloads the Nitro display-name fonts into `assets/fonts/`.
 *
 * Discord styles names with Google Fonts, all of them under the SIL Open Font
 * License 1.1, which permits embedding and redistribution as long as the licence
 * travels with the font. `assets/fonts/OFL.txt` carries it.
 *
 * Only the latin subset is fetched — a card renders one display name, and the
 * full family would be several times the size of everything else in the SVG.
 *
 * Run after changing the map: `npm run fonts`
 */
import { mkdir, writeFile } from "node:fs/promises";

/**
 * font_id → family, as mapped by the Glance widget. Only id 12 is confirmed
 * against Discord's own markup (`zillaSlab__89a31` on the name element); the
 * rest follow that mapping. An id without a file simply keeps the card font.
 */
const FONTS = {
  1: { family: "Bangers", weight: 400 },
  2: { family: "BioRhyme", weight: 700 },
  3: { family: "Cherry Bomb One", weight: 400 },
  4: { family: "Chicle", weight: 400 },
  6: { family: "MuseoModerno", weight: 700 },
  7: { family: "Cinzel", weight: 700 },
  8: { family: "Pixelify Sans", weight: 700 },
  9: { family: "Bree Serif", weight: 400 },
  12: { family: "Zilla Slab", weight: 700 },
};

// Without a browser user agent the API serves TTF instead of woff2.
const UA =
  "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120 Safari/537.36";

const dir = new URL("../assets/fonts/", import.meta.url);
await mkdir(dir, { recursive: true });

const index = {};

for (const [id, { family, weight }] of Object.entries(FONTS)) {
  const query = `family=${family.replace(/ /g, "+")}:wght@${weight}&display=swap`;
  const css = await fetch(`https://fonts.googleapis.com/css2?${query}`, {
    headers: { "user-agent": UA },
  }).then((r) => r.text());

  // The API emits one @font-face per subset; the last block is latin.
  const blocks = css.split("@font-face").filter((b) => b.includes("src:"));
  const latin = blocks.find((b) => b.includes("U+0000-00FF")) ?? blocks.at(-1);
  const url = latin?.match(/https:\/\/fonts\.gstatic\.com\/[^)]+\.woff2/)?.[0];
  if (!url) {
    console.warn(`no woff2 for ${family}`);
    continue;
  }

  const file = `${family.toLowerCase().replace(/ /g, "-")}.woff2`;
  const bytes = new Uint8Array(await fetch(url).then((r) => r.arrayBuffer()));
  await writeFile(new URL(file, dir), bytes);
  index[id] = { family, file, weight };
  console.log(`${family.padEnd(18)} ${String(bytes.byteLength).padStart(7)} bytes → ${file}`);
}

await writeFile(new URL("index.json", dir), `${JSON.stringify(index, null, 2)}\n`);
console.log(`\nwrote ${Object.keys(index).length} fonts`);
