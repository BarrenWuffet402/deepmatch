#!/usr/bin/env node
/**
 * Upload a local MP4 to Cloudflare R2 and register its metadata.
 *
 * Usage:
 *   node scripts/upload.js --file <path> --slug <slug> --title <title>
 *
 * Example:
 *   node scripts/upload.js \
 *     --file "stored-videos/Jonni's Special Report for Andrea_1080p_caption.mp4" \
 *     --slug andrea \
 *     --title "Jonni's Special Report for Andrea"
 */

import { PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { createReadStream, existsSync, readFileSync, statSync } from "node:fs";
import { extname } from "node:path";
import { fileURLToPath } from "node:url";
import { join, dirname } from "node:path";

// ── Load .env ──────────────────────────────────────────
const root = dirname(dirname(fileURLToPath(import.meta.url)));
const envPath = join(root, ".env");
if (existsSync(envPath)) {
  for (const line of readFileSync(envPath, "utf8").split("\n")) {
    const m = line.match(/^([A-Z_][A-Z0-9_]*)\s*=\s*(.*)$/);
    if (m && !process.env[m[1]]) {
      process.env[m[1]] = m[2].replace(/^['"]|['"]$/g, "").trim();
    }
  }
}

// ── Parse args ─────────────────────────────────────────
const args = process.argv.slice(2);
function getArg(name) {
  const i = args.indexOf(`--${name}`);
  return i !== -1 ? args[i + 1] : null;
}

const filePath = getArg("file");
const slug = getArg("slug");
const title = getArg("title");

if (!filePath || !slug || !title) {
  console.error("Usage: node scripts/upload.js --file <path> --slug <slug> --title <title>");
  process.exit(1);
}

if (!/^[a-z0-9-]+$/.test(slug)) {
  console.error("slug must be lowercase letters, numbers, hyphens only (e.g. andrea)");
  process.exit(1);
}

const fullPath = existsSync(filePath) ? filePath : join(root, filePath);
if (!existsSync(fullPath)) {
  console.error(`File not found: ${fullPath}`);
  process.exit(1);
}

// ── Validate env ───────────────────────────────────────
for (const key of ["R2_ACCOUNT_ID", "R2_ACCESS_KEY_ID", "R2_SECRET_ACCESS_KEY", "R2_BUCKET_NAME", "R2_PUBLIC_URL"]) {
  if (!process.env[key]) {
    console.error(`Missing env var: ${key} — copy .env.example to .env and fill it in.`);
    process.exit(1);
  }
}

// ── Upload ─────────────────────────────────────────────
const s3 = new S3Client({
  region: "auto",
  endpoint: `https://${process.env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
  credentials: {
    accessKeyId: process.env.R2_ACCESS_KEY_ID,
    secretAccessKey: process.env.R2_SECRET_ACCESS_KEY,
  },
  requestHandler: { requestTimeout: 600_000 },
});

const bucket = process.env.R2_BUCKET_NAME;
const publicUrl = process.env.R2_PUBLIC_URL.replace(/\/$/, "");
const videoKey = `videos/${slug}.mp4`;
const metaKey = `metadata/${slug}.json`;

const fileSize = statSync(fullPath).size;
const fileSizeMB = (fileSize / 1024 / 1024).toFixed(1);

console.log(`\nUploading "${title}" (${fileSizeMB} MB) as "${slug}"…`);

// Progress logging
let uploaded = 0;
let lastPct = -1;

const stream = createReadStream(fullPath);
stream.on("data", (chunk) => {
  uploaded += chunk.length;
  const pct = Math.floor((uploaded / fileSize) * 100);
  if (pct !== lastPct && pct % 5 === 0) {
    process.stdout.write(`\r  ${pct}%  (${(uploaded / 1024 / 1024).toFixed(1)} / ${fileSizeMB} MB)`);
    lastPct = pct;
  }
});

try {
  await s3.send(new PutObjectCommand({
    Bucket: bucket,
    Key: videoKey,
    Body: createReadStream(fullPath),
    ContentType: "video/mp4",
    ContentLength: fileSize,
  }));
  process.stdout.write("\r  100% — video uploaded ✓\n");
} catch (e) {
  console.error("\nUpload failed:", e.message);
  process.exit(1);
}

// ── Write metadata ─────────────────────────────────────
const metadata = {
  slug,
  title,
  url: `${publicUrl}/${videoKey}`,
  createdAt: new Date().toISOString(),
};

await s3.send(new PutObjectCommand({
  Bucket: bucket,
  Key: metaKey,
  Body: JSON.stringify(metadata, null, 2),
  ContentType: "application/json",
}));

console.log("  metadata saved ✓");
console.log(`\n  Watch URL: https://YOUR_APP.vercel.app/watch/${slug}`);
console.log(`  Video URL: ${metadata.url}\n`);
