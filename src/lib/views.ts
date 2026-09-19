/**
 * Profile view counter.
 *
 * Counting a README image works at all because GitHub's Camo proxy refetches
 * what it is told not to cache — the badge route sends the same
 * `max-age=0, no-cache, no-store, must-revalidate` recipe komarev's counter
 * uses, and no ETag, so there is nothing to revalidate against either.
 *
 * What that buys is a *hit* counter, not a visitor counter: Camo replaces the
 * client, so there is no address, agent or user to deduplicate by, and crawlers
 * are indistinguishable from readers. The number says "this image was fetched
 * n times", nothing more — which is exactly what every README counter reports.
 */
import { readFileSync, renameSync, writeFileSync } from "node:fs";
import { config } from "../config.ts";

const counts = new Map<string, number>();
let dirty = false;
let timer: ReturnType<typeof setTimeout> | null = null;
let writeFailed = false;

/** A missing or broken file starts everyone at zero rather than refusing to boot. */
function load(): void {
  try {
    const raw: unknown = JSON.parse(readFileSync(config.views.file, "utf8"));
    if (!raw || typeof raw !== "object") return;
    for (const [id, value] of Object.entries(raw as Record<string, unknown>)) {
      if (typeof value === "number" && Number.isFinite(value) && value >= 0) {
        counts.set(id, Math.floor(value));
      }
    }
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") {
      console.warn("views file unreadable, starting empty", { error: String(error) });
    }
  }
}

/** Write to a sibling and rename, so a crash mid-write cannot truncate the file. */
function flush(): void {
  timer = null;
  if (!dirty) return;
  try {
    writeFileSync(`${config.views.file}.tmp`, JSON.stringify(Object.fromEntries(counts)));
    renameSync(`${config.views.file}.tmp`, config.views.file);
    dirty = false;
    writeFailed = false;
  } catch (error) {
    // Counting carries on in memory; only persistence is lost, and `dirty`
    // stays set so the next bump retries.
    if (!writeFailed) {
      console.error("views file unwritable", { file: config.views.file, error: String(error) });
    }
    writeFailed = true;
  }
}

/** Records one hit and returns the new total. */
export function bump(id: string): number {
  const next = (counts.get(id) ?? 0) + 1;
  counts.set(id, next);
  dirty = true;
  // ponytail: debounced whole-file rewrite. Fine for a handful of allowlisted
  // ids; swap for SQLite if this ever serves more than that.
  if (!timer) timer = setTimeout(flush, config.views.flushMs).unref();
  return next;
}

export function views(id: string): number {
  return counts.get(id) ?? 0;
}

/** Test seam: forces the pending write out without waiting for the debounce. */
export function flushNow(): void {
  if (timer) clearTimeout(timer);
  timer = null;
  flush();
}

if (config.views.enabled) {
  load();
  // The debounce timer is unref'd, so without this a `docker stop` would drop
  // up to `flushMs` worth of counts.
  for (const signal of ["SIGTERM", "SIGINT"] as const) {
    process.once(signal, () => {
      flushNow();
      process.exit(0);
    });
  }
  process.once("exit", flushNow);
}
