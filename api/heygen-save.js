/**
 * /api/heygen-save
 *
 * POST { video_id, video_url, slug, title }
 *   → registers the video in R2 metadata (using the HeyGen CDN URL directly)
 *   → returns the watch URL
 *
 * Note: video is served from HeyGen's CDN (expires ~7 days).
 * For permanent storage, add R2 archival here later.
 */

import { PutObjectCommand } from "@aws-sdk/client-s3";
import { BUCKET, r2Client } from "./_r2.js";

export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  if (req.method === "OPTIONS") return res.status(204).end();
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  const { video_id, video_url, slug, title } = req.body || {};

  if (!slug || !/^[a-z0-9-]+$/.test(slug))
    return res.status(400).json({ error: "invalid slug" });
  if (!video_url) return res.status(400).json({ error: "video_url required" });
  if (!title?.trim()) return res.status(400).json({ error: "title required" });

  const s3 = r2Client();
  const metadata = {
    slug,
    title: title.trim(),
    url: video_url,
    source: "heygen",
    heygen_video_id: video_id || null,
    createdAt: new Date().toISOString(),
  };

  await s3.send(new PutObjectCommand({
    Bucket: BUCKET(),
    Key: `metadata/${slug}.json`,
    Body: JSON.stringify(metadata, null, 2),
    ContentType: "application/json",
  }));

  return res.status(200).json({
    slug,
    watch_url: `/watch/${slug}`,
    video_url,
  });
}
