import assert from "node:assert/strict";
import { test } from "node:test";
import { assertAllowedUrl, UpstreamError } from "../src/lib/http.ts";
import { toAssetUrl } from "../src/lib/assets.ts";
import { parseCardParams } from "../src/render/params.ts";

test("outbound requests are restricted to known hosts", () => {
  assert.ok(assertAllowedUrl("https://cdn.discordapp.com/avatars/1/a.webp"));
  assert.throws(() => assertAllowedUrl("https://ilovemusic.de/cover.jpg"), UpstreamError);
  assert.throws(() => assertAllowedUrl("https://169.254.169.254/latest/meta-data/"), UpstreamError);
  assert.throws(() => assertAllowedUrl("http://cdn.discordapp.com/a.png"), UpstreamError);
  assert.throws(() => assertAllowedUrl("file:///etc/passwd"), UpstreamError);
});

test("every documented asset format resolves to its own fixed host", () => {
  // Discord's presence docs: mp:, spotify:, twitch:, youtube: and plain app assets.
  assert.equal(
    toAssetUrl("spotify:ab67616d0000b273b006ef", null, 640),
    "https://i.scdn.co/image/ab67616d0000b273b006ef",
  );
  assert.equal(
    toAssetUrl("youtube:dQw4w9WgXcQ", null, 160),
    "https://i.ytimg.com/vi/dQw4w9WgXcQ/hqdefault.jpg",
  );
  assert.equal(
    toAssetUrl("twitch:discord", null, 160),
    "https://static-cdn.jtvnw.net/previews-ttv/live_user_discord-160x160.jpg",
  );
  assert.ok(
    toAssetUrl("mp:attachments/1/2/cover.png", null, 160)?.startsWith(
      "https://media.discordapp.net/attachments/1/2/cover.png",
    ),
  );
});

test("malformed asset identifiers are dropped, not patched into a URL", () => {
  // The part after the prefix comes from whoever sets the presence.
  assert.equal(toAssetUrl("spotify:../../etc/passwd", null, 160), null);
  assert.equal(toAssetUrl("twitch:evil/../x", null, 160), null);
  assert.equal(toAssetUrl("youtube:id?x=1", null, 160), null);
  assert.equal(toAssetUrl("mp:../secret", null, 160), null);
  assert.equal(toAssetUrl("spotify:id#frag", null, 160), null);
});

test("activity assets never resolve to an attacker-chosen host", () => {
  // A Rich Presence controls this string; only the proxy form may come out.
  const proxied = toAssetUrl("mp:external/hash/https/evil.example/x.png", "1", 160);
  assert.ok(proxied?.startsWith("https://media.discordapp.net/external/hash/"));

  assert.equal(toAssetUrl("https://evil.example/x.png", "1", 160), null);
  assert.equal(toAssetUrl("https://cdn.discordapp.com/x.png", "1", 160), "https://cdn.discordapp.com/x.png");
  assert.equal(toAssetUrl("asset_id", null, 160), null, "app assets need an application id");
});

test("card parameters reject injection and fall back to defaults", () => {
  const params = parseCardParams({
    theme: "solarized",
    layout: "'; background: url(http://x)",
    accent: "red; content: 'x'",
    bg: "1a1c1f",
    borderRadius: "9999px",
    clanBackgroundColor: "url(javascript:alert(1))",
    idleMessage: "a".repeat(500),
  });

  assert.equal(params.theme, "dark");
  assert.equal(params.layout, "card");
  assert.equal(params.accent, null, "non-hex colors are dropped");
  assert.equal(params.clanBackgroundColor, null);
  assert.equal(params.bg, "#1a1c1f");
  assert.equal(params.borderRadius, 40, "radius is clamped, CSS units tolerated");
  assert.equal(params.idleMessage.length, 64, "free text is capped");
});

test("ignoreAppId only accepts snowflakes", () => {
  const params = parseCardParams({ ignoreAppId: "1463256349373632711, ../../etc/passwd, 42" });
  assert.deepEqual(params.ignoreAppId, ["1463256349373632711"]);
});

test("hideActivity keeps its third state", () => {
  assert.equal(parseCardParams({ hideActivity: "whenNotUsed" }).hideActivity, "whenNotUsed");
  assert.equal(parseCardParams({ hideActivity: "true" }).hideActivity, true);
  assert.equal(parseCardParams({ hideActivity: "nonsense" }).hideActivity, false);
});
