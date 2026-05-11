/**
 * /api/heygen — HeyGen video generation proxy
 *
 * POST  { script, slug, title, portrait? }  → generate video → { video_id }
 * GET   ?video_id=xxx                        → poll status   → { status, video_url? }
 */

const GENERATE_URL = "https://api.heygen.com/v2/video/generate";
const STATUS_URL   = "https://api.heygen.com/v1/video_status.get";

function apiKey() {
  const k = process.env.HEYGEN_API_KEY;
  if (!k) throw new Error("HEYGEN_API_KEY not set");
  return k;
}

export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  if (req.method === "OPTIONS") return res.status(204).end();

  // ── GET: poll status ────────────────────────────────────────────────────
  if (req.method === "GET") {
    const { video_id } = req.query;
    if (!video_id) return res.status(400).json({ error: "video_id required" });

    const r = await fetch(`${STATUS_URL}?video_id=${encodeURIComponent(video_id)}`, {
      headers: { Authorization: `Bearer ${apiKey()}` },
    });
    const d = await r.json();
    if (!r.ok) return res.status(r.status).json({ error: d?.message || "Status check failed" });

    return res.status(200).json({
      status:    d.data?.status,           // processing | completed | failed
      video_url: d.data?.video_url || null,
      thumbnail: d.data?.thumbnail_url || null,
      duration:  d.data?.duration || null,
    });
  }

  // ── POST: generate ──────────────────────────────────────────────────────
  if (req.method === "POST") {
    const { script, slug, title, portrait = true } = req.body || {};

    if (!script?.trim()) return res.status(400).json({ error: "script is required" });
    if (!slug || !/^[a-z0-9-]+$/.test(slug))
      return res.status(400).json({ error: "slug must be lowercase letters, numbers, hyphens" });

    const avatarId = process.env.HEYGEN_AVATAR_ID;
    const voiceId  = process.env.HEYGEN_VOICE_ID;
    if (!avatarId || !voiceId)
      return res.status(500).json({ error: "HEYGEN_AVATAR_ID or HEYGEN_VOICE_ID not configured" });

    const dimension = portrait
      ? { width: 720, height: 1280 }   // mobile portrait — best for profile videos
      : { width: 1280, height: 720 };  // landscape

    const body = {
      video_inputs: [{
        character: { type: "avatar", avatar_id: avatarId, avatar_style: "normal" },
        voice:     { type: "text",   input_text: script.trim(), voice_id: voiceId },
      }],
      dimension,
      // test: true,  // uncomment to use watermarked test renders (faster, free)
    };

    const r = await fetch(GENERATE_URL, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey()}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
    });

    const d = await r.json();
    if (!r.ok || d.error) return res.status(r.status).json({ error: d?.error || "Generation failed" });

    return res.status(200).json({ video_id: d.data.video_id, slug, title });
  }

  return res.status(405).json({ error: "Method not allowed" });
}
