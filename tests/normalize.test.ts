import assert from "node:assert/strict";
import { test } from "node:test";
import { normalizePresence, normalizeUser } from "../src/lib/normalize.ts";
import type { LanyardData } from "../src/lib/lanyard.ts";

/** The real payload that motivated this service: a custom app announcing type 2. */
const radio: LanyardData = {
  discord_status: "online",
  active_on_discord_desktop: true,
  discord_user: {
    id: "400672307833733121",
    username: "nichtlegacy",
    global_name: "LEGACY",
    avatar: "a_0f68c159175b2af23afdea73b625660a",
    primary_guild: { identity_guild_id: "111504456838819840", tag: "PKMN", badge: "f8e9d20c" },
  },
  activities: [
    { type: 4, name: "Custom Status", emoji: { id: "1180296516049588315", animated: true } },
    {
      type: 2,
      name: "I LOVE MUSIC",
      application_id: "1463256349373632711",
      details: "BE MY LOVER",
      state: "LA BOUCHE",
      buttons: ["Listen to I ♥ RADIO"],
      timestamps: { start: Date.now() - 65_000 },
      assets: {
        large_image: "mp:external/abc123/https/ilovemusic.de/cover.jpg",
        large_text: "I ♥ RADIO",
        small_image: "mp:external/def456/https/ilovemusic.de/icon.png",
      },
    },
  ],
};

test("keeps non-Spotify listening activities", () => {
  const presence = normalizePresence(radio);
  assert.equal(presence.activities.length, 1);
  assert.equal(presence.primary?.type, "listening");
  assert.equal(presence.primary?.details, "BE MY LOVER");
  assert.equal(presence.primary?.state, "LA BOUCHE");
  assert.equal(presence.listening?.name, "I LOVE MUSIC");
});

test("routes external assets through Discord's media proxy", () => {
  const presence = normalizePresence(radio);
  const large = presence.primary?.images.large ?? "";
  assert.ok(large.startsWith("https://media.discordapp.net/external/abc123/"));
  assert.ok(!large.includes("//ilovemusic.de"), "origin host must never be fetched directly");
});

test("separates the custom status from real activities", () => {
  const presence = normalizePresence(radio);
  assert.ok(presence.customStatus);
  assert.ok(presence.customStatus?.emoji?.includes("1180296516049588315"));
  assert.ok(presence.activities.every((a) => a.type !== "custom"));
});

test("exposes elapsed time for timed activities", () => {
  const presence = normalizePresence(radio);
  assert.ok((presence.primary?.elapsedSeconds ?? 0) >= 60);
});

test("strips control characters from upstream text", () => {
  const presence = normalizePresence({
    ...radio,
    activities: [{ type: 0, name: "Game", details: "linebreak" }],
  });
  assert.equal(presence.primary?.name, "Game");
  assert.equal(presence.primary?.details, "linebreak");
});

test("falls back to offline for unknown status values", () => {
  const presence = normalizePresence({ ...radio, discord_status: "sleeping" });
  assert.equal(presence.status, "offline");
});

test("builds animated avatar urls and clan badges", () => {
  const user = normalizeUser(radio, null);
  assert.ok(user.avatar.endsWith(".gif?size=128"));
  assert.equal(user.clan?.tag, "PKMN");
  assert.equal(user.banner, null, "banner needs dcdn, absent here");
});
