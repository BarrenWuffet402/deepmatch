/**
 * /api/seedance — Seedance text-to-video via fal.ai
 *
 * POST { prompt, slug, title, duration?, aspect_ratio?, style?, style_id? }
 *   → { request_id, slug, title, status_url }
 *
 * GET  ?request_id=xxx → poll status → { status, video_url? }
 */

const MODEL    = process.env.SEEDANCE_MODEL || "bytedance/seedance-2.0/fast/text-to-video";
const BASE_URL = `https://queue.fal.run/${MODEL}`;

function falKey() {
  const k = process.env.FAL_KEY;
  if (!k) throw new Error("FAL_KEY not set — add it in Vercel environment variables");
  return k;
}

export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  if (req.method === "OPTIONS") return res.status(204).end();

  // ── GET: poll status ──────────────────────────────────────────────────────
  if (req.method === "GET") {
    const { request_id } = req.query;
    if (!request_id) return res.status(400).json({ error: "request_id required" });

    const statusUrl = `https://queue.fal.run/${MODEL}/requests/${request_id}/status`;
    const r = await fetch(statusUrl, {
      headers: { Authorization: `Key ${falKey()}` },
    });
    const d = await r.json();
    if (!r.ok) return res.status(r.status).json({ error: "Status check failed" });

    // Fal status: IN_QUEUE | IN_PROGRESS | COMPLETED | FAILED
    if (d.status === "COMPLETED") {
      // Fetch the actual result
      const resultUrl = `https://queue.fal.run/${MODEL}/requests/${request_id}`;
      const rr = await fetch(resultUrl, {
        headers: { Authorization: `Key ${falKey()}` },
      });
      const result = await rr.json();
      const videoUrl = result?.video?.url || result?.video_url || result?.output?.video?.url || null;

      return res.status(200).json({
        status:    "completed",
        video_url: videoUrl,
      });
    }

    return res.status(200).json({
      status: d.status?.toLowerCase() || "processing",
      queue_position: d.queue_position || null,
    });
  }

  // ── POST: generate ────────────────────────────────────────────────────────
  if (req.method === "POST") {
    const {
      prompt,
      slug,
      title,
      duration     = 5,
      aspect_ratio = "9:16",   // 9:16 portrait (mobile), 16:9 landscape, 1:1 square
      style,
      style_id,
    } = req.body || {};

    if (!prompt?.trim()) return res.status(400).json({ error: "prompt is required" });
    if (!slug || !/^[a-z0-9-]+$/.test(slug))
      return res.status(400).json({ error: "slug must be lowercase letters, numbers, hyphens" });

    // Build the full prompt — append style hints if provided
    let fullPrompt = prompt.trim();
    if (style?.trim())    fullPrompt += `, ${style.trim()}`;
    if (style_id?.trim()) fullPrompt += `, style:${style_id.trim()}`;

    const payload = {
      prompt:       fullPrompt,
      duration:     Number(duration),
      aspect_ratio,
    };

    const r = await fetch(BASE_URL, {
      method: "POST",
      headers: {
        Authorization: `Key ${falKey()}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
    });

    const d = await r.json();
    if (!r.ok || d.detail)
      return res.status(r.status).json({ error: d?.detail || "Seedance generation failed" });

    return res.status(200).json({
      request_id: d.request_id,
      status_url: d.status_url,
      slug,
      title,
    });
  }

  return res.status(405).json({ error: "Method not allowed" });
}
