import { GetObjectCommand, ListObjectsV2Command, PutObjectCommand } from "@aws-sdk/client-s3";
import { BUCKET, PUBLIC_URL, r2Client } from "./_r2.js";

export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");

  const s3 = r2Client();
  const bucket = BUCKET();

  // GET /api/videos?slug=xxx  →  single video metadata
  // GET /api/videos            →  list all videos
  if (req.method === "GET") {
    const slug = req.query?.slug;

    if (slug) {
      try {
        const obj = await s3.send(new GetObjectCommand({ Bucket: bucket, Key: `metadata/${slug}.json` }));
        const body = await streamToString(obj.Body);
        res.setHeader("Content-Type", "application/json");
        return res.status(200).send(body);
      } catch {
        return res.status(404).json({ error: "Video not found" });
      }
    }

    try {
      const listed = await s3.send(new ListObjectsV2Command({ Bucket: bucket, Prefix: "metadata/" }));
      const keys = (listed.Contents || []).filter((o) => o.Key.endsWith(".json")).map((o) => o.Key);

      const videos = await Promise.all(
        keys.map(async (key) => {
          const obj = await s3.send(new GetObjectCommand({ Bucket: bucket, Key: key }));
          return JSON.parse(await streamToString(obj.Body));
        })
      );

      return res.status(200).json(
        videos.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))
      );
    } catch (e) {
      return res.status(500).json({ error: e.message });
    }
  }

  // POST /api/videos  →  register a video after R2 upload
  if (req.method === "POST") {
    const { slug, title } = req.body || {};

    if (!slug || !/^[a-z0-9-]+$/.test(slug)) {
      return res.status(400).json({ error: "slug must be lowercase letters, numbers, hyphens" });
    }
    if (!title?.trim()) {
      return res.status(400).json({ error: "title is required" });
    }

    const metadata = {
      slug,
      title: title.trim(),
      url: `${PUBLIC_URL()}/videos/${slug}.mp4`,
      createdAt: new Date().toISOString(),
    };

    await s3.send(new PutObjectCommand({
      Bucket: bucket,
      Key: `metadata/${slug}.json`,
      Body: JSON.stringify(metadata, null, 2),
      ContentType: "application/json",
    }));

    return res.status(200).json(metadata);
  }

  return res.status(405).json({ error: "Method not allowed" });
}

async function streamToString(stream) {
  const chunks = [];
  for await (const chunk of stream) chunks.push(chunk);
  return Buffer.concat(chunks).toString("utf8");
}
