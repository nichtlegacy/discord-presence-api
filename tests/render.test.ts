import assert from "node:assert/strict";
import { test } from "node:test";
import { renderToStaticMarkup } from "react-dom/server";
// Node's type stripping cannot load JSX, so the card is exercised through the
// build output — which is also what actually ships. `npm test` builds first.
import { buildPayload } from "../dist/lib/normalize.js";
import type { LanyardData } from "../src/lib/lanyard.ts";
import { renderCard } from "../dist/render/card.js";
import { parseCardParams } from "../dist/render/params.js";
import { selectActivities } from "../dist/render/select.js";

const NO_IMAGES = {
  avatar: null,
  decoration: null,
  banner: null,
  nameplate: null,
  clanBadge: null,
  badges: [],
  statusEmoji: null,
  activityLarge: null,
  activitySmall: null,
  secondaryLarge: null,
};

function card(data: LanyardData, query: Record<string, string> = {}) {
  const payload = buildPayload(data, null);
  const params = parseCardParams(query);
  const selection = selectActivities(payload.presence, params);
  return renderToStaticMarkup(renderCard(payload, params, NO_IMAGES, selection));
}

const user = {
  id: "400672307833733121",
  username: "nichtlegacy",
  global_name: "LEGACY",
  avatar: null,
};

/** A track: Discord reports both ends, so the card can show progress. */
const spotify: LanyardData = {
  discord_status: "online",
  discord_user: user,
  activities: [
    {
      type: 2,
      name: "Spotify",
      details: "Dirrty",
      state: "Christina Aguilera",
      timestamps: { start: Date.now() - 60_000, end: Date.now() + 120_000 },
    },
  ],
};

/** A stream: open-ended, so only elapsed time makes sense. */
const radio: LanyardData = {
  discord_status: "online",
  discord_user: user,
  activities: [
    { type: 2, name: "I LOVE MUSIC", details: "Be My Lover", timestamps: { start: Date.now() - 60_000 } },
  ],
};

test("shows a progress bar when an activity reports an end", () => {
  const svg = card(spotify);
  assert.ok(svg.includes("height:4px"), "the bar is drawn");
  assert.match(svg, /width:3[0-9](\.\d+)?%/, "one third elapsed of a three minute track");
  assert.ok(svg.includes("01:00"), "current position");
  assert.ok(svg.includes("03:00"), "total length");
  assert.ok(!svg.includes("elapsed"), "the elapsed line is replaced by the bar");
});

test("falls back to elapsed time for open-ended activities", () => {
  const svg = card(radio);
  assert.ok(svg.includes("01:00 elapsed"));
  assert.ok(!svg.includes("height:4px"), "no bar without a known total");
});

test("hideTimestamp removes both forms", () => {
  const svg = card(spotify, { hideTimestamp: "true" });
  assert.ok(!svg.includes("03:00"));
  assert.ok(!svg.includes("elapsed"));
});

test("maxActivities stacks a second activity", () => {
  const both: LanyardData = {
    ...radio,
    activities: [
      { type: 0, name: "Factorio", details: "Nauvis" },
      { type: 2, name: "I LOVE MUSIC", details: "Be My Lover", state: "La Bouche" },
    ],
  };

  const one = card(both);
  assert.ok(one.includes("Factorio"));
  assert.ok(!one.includes("Be My Lover"), "only the primary by default");

  const two = card(both, { maxActivities: "2" });
  assert.ok(two.includes("Factorio") && two.includes("Be My Lover"));
});

test("deployment defaults apply and requests still override them", () => {
  const defaults = { hideBadges: "true", theme: "light" };
  assert.equal(parseCardParams({}, defaults).theme, "light");
  assert.equal(parseCardParams({ theme: "dark" }, defaults).theme, "dark");
  assert.equal(parseCardParams({}, defaults).hideBadges, true);
});
