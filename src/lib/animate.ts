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

/** Rendered plate size; frames beyond it are wasted bytes. */
const TARGET_WIDTH = 320;
const TARGET_HEIGHT = 60;
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

/** Only a hex colour ever reaches the filter graph. */
const HEX = /^#[0-9a-fA-F]{6}$/;

async function transcode(video: Uint8Array, background: string): Promise<string | null> {
  // A temp directory rather than pipes: the matroska demuxer wants to seek.
  const dir = await mkdtemp(join(tmpdir(), "plate-"));
  const input = join(dir, "in.webm");
  const output = join(dir, "out.webp");
  try {
    await writeFile(input, video);
    // Fixed argument list, no shell: nothing here is user-controlled anyway,
    // but the input path is the only variable and it never reaches a shell.
    /*
     * Two things the obvious command gets wrong:
     *
     * 1. The native VP9 decoder reports yuv420p and silently drops the alpha
     *    channel the plate needs — `-c:v libvpx-vp9` decodes it as yuva420p.
     * 2. Animated WebP cannot store per-frame alpha (libwebp writes the frames
     *    opaque), so the artwork is composited onto the card colour here. On a
     *    light card the alternative is a grey slab; APNG would preserve alpha
     *    but costs ~237 KB against ~16 KB for this.
     */
    const colour = HEX.test(background) ? background.replace("#", "0x") : "0x1a1c1f";
    await run(
      "ffmpeg",
      [
        "-v", "error",
        "-c:v", "libvpx-vp9",
        "-i", input,
        "-filter_complex",
        // The colour source defaults to 25 fps; without pinning it the overlay
        // emits 25 frames per second regardless of the video and the file triples.
        `color=c=${colour}:s=${TARGET_WIDTH}x${TARGET_HEIGHT}:r=${FPS}[bg];` +
          `[0:v]scale=${TARGET_WIDTH}:${TARGET_HEIGHT}:flags=lanczos,fps=${FPS}[fg];` +
          `[bg][fg]overlay=shortest=1`,
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

/**
 * Returns a data URI for the animated plate, or null to fall back to the static
 * one. Cached per background, since the colour is baked into the frames.
 */
export async function animatedNameplate(
  videoUrl: string,
  background: string,
): Promise<string | null> {
  if (!(await hasFfmpeg())) return null;

  return cache.wrap(`${videoUrl}|${background}`, config.ttl.collectible, async () => {
    try {
      return await transcode(await fetchBytes(videoUrl, "video/webm"), background);
    } catch {
      return null;
    }
  });
}
