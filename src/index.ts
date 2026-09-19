/**
 * HTTP surface.
 *
 * Two endpoints on purpose: JSON for own clients (dashboard, Glance widget),
 * SVG for READMEs. Only the SVG route needs to be reachable from the internet —
 * keep `/v1/users/:id` on the internal network at the reverse proxy.
 */
import { serve } from "@hono/node-server";
import { Hono } from "hono";
import { renderToStaticMarkup } from "react-dom/server";
import { config, isAllowedUser } from "./config.ts";
import { getPresence } from "./lib/presence.ts";
import { hit, sweep } from "./lib/ratelimit.ts";
import { bump } from "./lib/views.ts";
import { collectImages } from "./render/images.ts";
import { parseCardParams } from "./render/params.ts";
import { renderBadge, parseBadgeParams } from "./render/badge.tsx";
import { renderCard } from "./render/card.tsx";
import { selectActivities } from "./render/select.ts";

const SNOWFLAKE = /^\d{17,20}$/;

const app = new Hono();

/** Only trust the proxy header when the deployment says a proxy sets it. */
function clientKey(c: { req: { header: (name: string) => string | undefined }; env: unknown }): string {
  if (config.trustProxy) {
    const forwarded = c.req.header("x-forwarded-for")?.split(",")[0]?.trim();
    if (forwarded) return forwarded;
  }
  const socket = (c.env as { incoming?: { socket?: { remoteAddress?: string } } } | undefined)
    ?.incoming?.socket;
  return socket?.remoteAddress ?? "unknown";
}

app.use("*", async (c, next) => {
  const key = clientKey(c);
  const { allowed, retryAfter } = hit(key);
  if (!allowed) {
    return c.json({ error: "rate limited" }, 429, { "retry-after": String(retryAfter) });
  }
  await next();
  c.header("x-content-type-options", "nosniff");
  c.header("referrer-policy", "no-referrer");
});

app.get("/healthz", (c) => c.json({ ok: true }));

/**
 * Guards shared by both routes: a valid snowflake that this instance is
 * configured to serve. Without the allowlist the container would render cards
 * for any Discord user on request.
 */
function checkUser(id: string): { ok: true } | { ok: false; status: 400 | 403; message: string } {
  if (!SNOWFLAKE.test(id)) return { ok: false, status: 400, message: "invalid user id" };
  if (!isAllowedUser(id)) return { ok: false, status: 403, message: "user not allowed" };
  return { ok: true };
}

app.get("/v1/users/:id", async (c) => {
  const id = c.req.param("id");
  const check = checkUser(id);
  if (!check.ok) return c.json({ error: check.message }, check.status);

  try {
    const payload = await getPresence(id);
    c.header("cache-control", `public, max-age=${config.ttl.presence}`);
    return c.json(payload);
  } catch (error) {
    console.error("presence failed", { id, error: String(error) });
    return c.json({ error: "upstream unavailable" }, 502);
  }
});

app.get("/v1/users/:id/card.svg", async (c) => {
  const id = c.req.param("id");
  const check = checkUser(id);
  if (!check.ok) return c.text(check.message, check.status);

  const params = parseCardParams(c.req.query(), config.defaultParams);

  try {
    const payload = await getPresence(id, {
      animatedAvatar: params.animated,
      animatedDecoration: params.animatedDecoration,
      animatedBanner: params.animatedBanner,
    });
    const selection = selectActivities(payload.presence, params);
    const images = await collectImages(payload, params, selection);
    const svg = renderToStaticMarkup(renderCard(payload, params, images, selection));

    return c.body(`<?xml version="1.0" encoding="UTF-8"?>\n${svg}`, 200, {
      "content-type": "image/svg+xml; charset=utf-8",
      // Short TTL so GitHub's proxy has a chance to pick up a new song.
      "cache-control": `public, max-age=${config.ttl.presence}, s-maxage=${config.ttl.presence}`,
      "content-security-policy": "default-src 'none'; img-src data:; style-src 'unsafe-inline'",
    });
  } catch (error) {
    console.error("card failed", { id, error: String(error) });
    return c.text("upstream unavailable", 502);
  }
});

/**
 * The counter itself. Every other route may be cached; this one must not be,
 * or Camo answers every future reader from its first copy and the number stops
 * moving. No ETag or Last-Modified either — a revalidation never reaches here.
 */
app.get("/v1/users/:id/views.svg", (c) => {
  const id = c.req.param("id");
  const check = checkUser(id);
  if (!check.ok) return c.text(check.message, check.status);
  if (!config.views.enabled) return c.text("view counting is disabled", 404);

  let svg: string;
  try {
    const params = parseBadgeParams(c.req.query(), config.defaultParams);
    svg = renderToStaticMarkup(renderBadge(bump(id), params));
  } catch (error) {
    // Nothing here reaches an upstream, so this only fires on a bug — a broken
    // image and the embed's alt text beat a half-written badge.
    console.error("badge failed", { id, error: String(error) });
    return c.text("badge unavailable", 502);
  }

  return c.body(`<?xml version="1.0" encoding="UTF-8"?>\n${svg}`, 200, {
    "content-type": "image/svg+xml; charset=utf-8",
    "cache-control": "max-age=0, no-cache, no-store, must-revalidate",
    pragma: "no-cache",
    expires: "0",
    "content-security-policy": "default-src 'none'; style-src 'unsafe-inline'",
  });
});

app.notFound((c) => c.json({ error: "not found" }, 404));

setInterval(sweep, config.limits.rateWindowMs).unref();

if (config.allowedUserIds.size === 0) {
  console.warn("ALLOWED_USER_IDS is empty — every request will be rejected with 403");
}

serve({ fetch: app.fetch, port: config.port }, (info) => {
  console.log(`discord-presence-api listening on :${info.port}`);
});

export { app };
