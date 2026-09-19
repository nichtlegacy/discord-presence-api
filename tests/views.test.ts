import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { renderToStaticMarkup } from "react-dom/server";

// config reads the environment once at import time, so the store has to be
// pointed somewhere writable before anything pulls it in — and the file has to
// exist before that too, since it is loaded once on the way up. node:test runs
// each file in its own process, so none of this leaks into another suite.
const FILE = join(mkdtempSync(join(tmpdir(), "views-")), "views.json");
writeFileSync(FILE, JSON.stringify({ "1": 5, junk: "not a number" }));
process.env.ENABLE_VIEWS = "true";
process.env.VIEWS_FILE = FILE;

// Built output, like the other render tests: type stripping cannot load JSX.
const { bump, views, flushNow } = await import("../dist/lib/views.js");
const { renderBadge, parseBadgeParams, formatViews, ICON_NAMES } = await import(
  "../dist/render/badge.js"
);

test("counts are restored on boot, and non-numeric entries dropped", () => {
  assert.equal(views("1"), 5);
  assert.equal(views("junk"), 0);
});

test("counts survive a restart", () => {
  assert.equal(bump("1"), 6);
  assert.equal(bump("2"), 1);
  flushNow();

  assert.deepEqual(JSON.parse(readFileSync(FILE, "utf8")), { "1": 6, "2": 1 });
});

test("the badge is wide enough for the text it holds", () => {
  const svg = renderToStaticMarkup(renderBadge(1234567, parseBadgeParams({})));
  assert.match(svg, /1,234,567/);
  assert.match(svg, /Profile Views/);
  assert.match(svg, /height="32"/);

  const width = Number(/width="(\d+)"/.exec(svg)?.[1]);
  // 12px text, so no glyph is narrower than ~4px: the pill has to clear the
  // icon, both gaps, the padding and every character it prints.
  assert.ok(width > 12 * 2 + 14 + 6 * 2 + "Profile Views1,234,567".length * 4, `width ${width}`);
});

test("badge label and colour are sanitised, not passed through", () => {
  // Both end up in a style attribute or as visible text, so a rejected colour
  // has to fall back rather than reach the document.
  const params = parseBadgeParams({ label: "</style><script>x", color: "red; x:y" });
  assert.equal(params.fill, "#5865f2");
  const svg = renderToStaticMarkup(renderBadge(1, params));
  assert.ok(!svg.includes("<script>"), svg);
  assert.ok(!svg.includes("x:y"), svg);
});

test("the badge matches shieldcn's geometry", () => {
  const svg = renderToStaticMarkup(renderBadge(1, parseBadgeParams({ color: "202830" })));
  assert.match(svg, /height="32"/);
  assert.match(svg, /border-radius:6px/);
  assert.match(svg, /background:#202830/);
  // A border would read as a seam next to a real shieldcn badge.
  assert.ok(!svg.includes("border:"), svg);
});

test("formatViews groups thousands", () => {
  assert.equal(formatViews(0), "0");
  assert.equal(formatViews(2867), "2,867");
});

test("every icon renders, and an unknown name falls back instead of blanking", () => {
  for (const name of ICON_NAMES) {
    const svg = renderToStaticMarkup(renderBadge(42, parseBadgeParams({ icon: name })));
    const glyphs = (svg.match(/viewBox="0 0 24 24"/g) ?? []).length;
    assert.equal(glyphs, name === "none" ? 0 : 1, name);
    assert.match(svg, /42/);
  }

  assert.equal(parseBadgeParams({ icon: "nope" }).icon, "bars");
});

test("dropping the icon takes its gap with it", () => {
  const widthOf = (icon: string) =>
    Number(/width="(\d+)"/.exec(renderToStaticMarkup(renderBadge(1, parseBadgeParams({ icon }))))?.[1]);

  // 16px glyph plus the 7px shieldcn leaves after it.
  assert.equal(widthOf("bars") - widthOf("none"), 23);
});
