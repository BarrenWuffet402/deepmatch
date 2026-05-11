import { PutObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { BUCKET, PUBLIC_URL, r2Client } from "./_r2.js";

export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") return res.status(204).end();
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  const { slug, contentType = "video/mp4" } = req.body || {};

  if (!slug || !/^[a-z0-9-]+$/.test(slug)) {
    return res.status(400).json({ error: "slug must be lowercase letters, numbers, hyphens" });
  }

  const s3 = r2Client();
  const key = `videos/${slug}.mp4`;

  const uploadUrl = await getSignedUrl(
    s3,
    new PutObjectCommand({
      Bucket: BUCKET(),
      Key: key,
      ContentType: contentType,
    }),
    { expiresIn: 3600 }
  );

  return res.status(200).json({
    uploadUrl,
    videoUrl: `${PUBLIC_URL()}/${key}`,
  });
}
