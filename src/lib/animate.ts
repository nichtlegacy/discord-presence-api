/**
 * Animated collectible support.
 *
 * Discord ships animated nameplates as .webm, and a video element inside an SVG
 * never plays — but an animated raster does, even in the static image context a
 * README embed uses (verified in Chromium: an animated GIF or WebP inlined in a
 * foreignObject keeps running when the SVG is loaded as `<img>`).
 *
 * So the video is transcoded to animated WebP once and cached: at the size the
 * plate is drawn that is ~20 KB, against ~73 KB for the same frames as GIF.
 *
 * ffmpeg is optional. Without it the card falls back to the static render.
 */
import { execFile } from "node:child_process";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";
import { config } from "../config.ts";
import { TtlCache } from "./cache.ts";
import { fetchBytes } from "./http.ts";

const run = promisify(execFile);

const cache = new TtlCache<string | null>(16);

/** Rendered plate width; frames beyond it are wasted bytes. */
const TARGET_WIDTH = 320;
const FPS = 12;
const TRANSCODE_TIMEOUT_MS = 15_000;
const MAX_OUTPUT_BYTES = 1_500_000;

let ffmpegAvailable: boolean | null = null;

async function hasFfmpeg(): Promise<boolean> {
  if (ffmpegAvailable !== null) return ffmpegAvailable;
  try {
    await run("ffmpeg", ["-version"], { timeout: 5000 });
    ffmpegAvailable = true;
  } catch {
    console.warn("ffmpeg not available — animated nameplates fall back to the static render");
    ffmpegAvailable = false;
  }
  return ffmpegAvailable;
}

async function transcode(video: Uint8Array): Promise<string | null> {
  // A temp directory rather than pipes: the matroska demuxer wants to seek.
  const dir = await mkdtemp(join(tmpdir(), "plate-"));
  const input = join(dir, "in.webm");
  const output = join(dir, "out.webp");
  try {
    await writeFile(input, video);
    // Fixed argument list, no shell: nothing here is user-controlled anyway,
    // but the input path is the only variable and it never reaches a shell.
    await run(
      "ffmpeg",
      [
        "-v", "error",
        "-i", input,
        "-vf", `scale=${TARGET_WIDTH}:-1:flags=lanczos,fps=${FPS}`,
        "-loop", "0",
        "-lossless", "0",
        "-q:v", "55",
        "-preset", "picture",
        "-an",
        "-y",
        output,
      ],
      { timeout: TRANSCODE_TIMEOUT_MS },
    );
    const encoded = await readFile(output);
    if (encoded.byteLength > MAX_OUTPUT_BYTES) return null;
    return `data:image/webp;base64,${encoded.toString("base64")}`;
  } catch (error) {
    console.error("nameplate transcode failed", { error: String(error) });
    return null;
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

/** Returns a data URI for the animated plate, or null to fall back to the static one. */
export async function animatedNameplate(videoUrl: string): Promise<string | null> {
  if (!(await hasFfmpeg())) return null;

  return cache.wrap(videoUrl, config.ttl.collectible, async () => {
    try {
      return await transcode(await fetchBytes(videoUrl, "video/webm"));
    } catch {
      return null;
    }
  });
}
