import assert from "node:assert/strict";
import { test } from "node:test";
import { renderToStaticMarkup } from "react-dom/server";
import { buildPayload } from "../dist/lib/normalize.js";
import type { LanyardActivity, LanyardData } from "../src/lib/lanyard.ts";
import { renderCard } from "../dist/render/card.js";
import { parseCardParams } from "../dist/render/params.js";
import { selectActivities } from "../dist/render/select.js";

/**
 * One fixture per activity shape Discord actually produces. Each carries its
 * own asset format, and those formats are the part that silently breaks: a
 * prefix we do not resolve renders a blank cover rather than an error.
 */
const FIXTURES: Record<string, LanyardActivity> = {
  // Spotify: no application_id at all, artwork as spotify:{id}, start and end.
  spotify: {
    type: 2,
    name: "Spotify",
    details: "Problems",
    state: "Lil Peep",
    sync_id: "5e90dsXJMBw9ndBRiKP1ZA",
    timestamps: { start: Date.now() - 95_000, end: Date.now() + 114_000 },
    assets: {
      large_image: "spotify:ab67616d0000b273b006ef6c1ce94763bb407519",
      large_text: "Come Over When You're Sober, Pt. 1",
    },
  },

  // A game with uploaded application assets, the classic Rich Presence case.
  game: {
    type: 0,
    name: "Factorio",
    details: "Nauvis",
    state: "Building a mall",
    application_id: "427520",
    timestamps: { start: Date.now() - 3_600_000 },
    assets: { large_image: "1234567890123456789", small_image: "9876543210987654321" },
  },

  // Console presence arrives as a game with proxied artwork.
  playstation: {
    type: 0,
    name: "PlayStation Network",
    details: "God of War Ragnarök",
    state: "Midgard",
    application_id: "1114681422081720400",
    assets: { large_image: "mp:external/abc/https/image.api.playstation.com/cover.png" },
  },

  // A stream: Discord points at Twitch's preview image.
  streaming: {
    type: 1,
    name: "Twitch",
    details: "Building a Discord card renderer",
    state: "nichtlegacy",
    assets: { large_image: "twitch:nichtlegacy" },
  },

  // Watching, with a YouTube thumbnail.
  watching: {
    type: 3,
    name: "YouTube",
    details: "Never Gonna Give You Up",
    assets: { large_image: "youtube:dQw4w9WgXcQ" },
  },

  // The custom radio app: type 2, but with its own external artwork.
  radio: {
    type: 2,
    name: "I LOVE MUSIC",
    details: "Be My Lover",
    state: "La Bouche",
    application_id: "1463256349373632711",
    timestamps: { start: Date.now() - 120_000 },
    assets: {
      large_image: "mp:external/xyz/https/ilovemusic.de/cover.jpg",
      small_image: "mp:external/uvw/https/ilovemusic.de/icon.png",
    },
  },
};

function payloadFor(activity: LanyardActivity) {
  const data: LanyardData = {
    discord_status: "online",
    discord_user: { id: "400672307833733121", username: "nichtlegacy", global_name: "LEGACY" },
    activities: [activity],
  };
  return buildPayload(data, null);
}

const EXPECTED_HOST: Record<string, string> = {
  spotify: "https://i.scdn.co/image/",
  game: "https://cdn.discordapp.com/app-assets/427520/",
  playstation: "https://media.discordapp.net/external/",
  streaming: "https://static-cdn.jtvnw.net/previews-ttv/",
  watching: "https://i.ytimg.com/vi/",
  radio: "https://media.discordapp.net/external/",
};

test("Spotify covers are requested at the size the card draws them", () => {
  // The id's prefix encodes the edge length: b273 is the 640px master at 142 KB,
  // 1e02 the 300px variant at 40 KB — for a cover drawn at 72px.
  const payload = payloadFor(FIXTURES.spotify!);
  const large = payload.presence.activities[0]?.images.large ?? "";
  assert.ok(large.includes("ab67616d00001e02"), `still the master: ${large}`);
});

for (const [name, activity] of Object.entries(FIXTURES)) {
  test(`${name}: artwork resolves to a known host`, () => {
    const payload = payloadFor(activity);
    const large = payload.presence.activities[0]?.images.large;
    assert.ok(large, `${name} produced no artwork url`);
    assert.ok(
      large.startsWith(EXPECTED_HOST[name]!),
      `${name} resolved to ${large}, expected ${EXPECTED_HOST[name]}…`,
    );
  });
}

test("each fixture renders its title and subtitle", () => {
  for (const [name, activity] of Object.entries(FIXTURES)) {
    const payload = payloadFor(activity);
    const params = parseCardParams({});
    const selection = selectActivities(payload.presence, params);
    const svg = renderToStaticMarkup(
      renderCard(payload, params, {
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
      }, selection),
    );
    if (activity.details) assert.ok(svg.includes(activity.details), `${name}: details missing`);
    if (activity.state) assert.ok(svg.includes(activity.state), `${name}: state missing`);
  }
});

test("activity type decides the verb", () => {
  const verbs: Record<string, string> = {
    spotify: "Listening to Spotify",
    game: "Playing Factorio",
    streaming: "Streaming Twitch",
    watching: "Watching YouTube",
  };
  for (const [name, verb] of Object.entries(verbs)) {
    const payload = payloadFor(FIXTURES[name]!);
    const params = parseCardParams({});
    const selection = selectActivities(payload.presence, params);
    const svg = renderToStaticMarkup(
      renderCard(payload, params, {
        avatar: null, decoration: null, banner: null, nameplate: null, clanBadge: null,
        badges: [], statusEmoji: null, activityLarge: null, activitySmall: null, secondaryLarge: null,
      }, selection),
    );
    assert.ok(svg.includes(verb), `${name}: expected "${verb}"`);
  }
});
