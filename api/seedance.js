/**
 * /api/seedance — Seedance text-to-video via fal.ai
 *
 * POST { prompt, slug, title, duration?, aspect_ratio?, style?, style_id? }
 *   → { request_id, status_url, response_url, slug, title }
 *
 * GET  ?request_id=xxx&status_url=<encoded>&response_url=<encoded>
 *   → { status, video_url? }
 *
 * NOTE: fal.ai polling uses a DIFFERENT base path than submission.
 *   Submit:  POST https://queue.fal.run/bytedance/seedance-2.0/fast/text-to-video
 *   Poll:    GET  https://queue.fal.run/bytedance/seedance-2.0/requests/{id}/status
 *   Result:  GET  https://queue.fal.run/bytedance/seedance-2.0/requests/{id}
 * Always use the status_url / response_url from the submit response directly.
 */

const MODEL = process.env.SEEDANCE_MODEL || "bytedance/seedance-2.0/fast/text-to-video";
const SUBMIT_URL = `https://queue.fal.run/${MODEL}`;

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
    const { request_id, status_url, response_url } = req.query;
    if (!request_id) return res.status(400).json({ error: "request_id required" });

    // Use the status_url from the initial response (correct fal.ai base path)
    const pollUrl = status_url
      ? decodeURIComponent(status_url)
      : `https://queue.fal.run/bytedance/seedance-2.0/requests/${request_id}/status`;

    let statusData;
    try {
      const r = await fetch(pollUrl, { headers: { Authorization: `Key ${falKey()}` } });
      statusData = await r.json();
      if (!r.ok) return res.status(200).json({ status: "processing" }); // keep polling on transient errors
    } catch (e) {
      return res.status(200).json({ status: "processing" }); // keep polling
    }

    if (statusData.status !== "COMPLETED") {
      const qp = statusData.queue_position != null ? statusData.queue_position : null;
      return res.status(200).json({
        status: statusData.status === "FAILED" ? "failed" : "processing",
        queue_position: qp,
      });
    }

    // COMPLETED — fetch the actual result
    const resultUrl = response_url
      ? decodeURIComponent(response_url)
      : `https://queue.fal.run/bytedance/seedance-2.0/requests/${request_id}`;

    let result;
    try {
      const rr = await fetch(resultUrl, { headers: { Authorization: `Key ${falKey()}` } });
      result = await rr.json();
    } catch (e) {
      return res.status(200).json({ status: "failed", error: "Could not fetch result" });
    }

    // Check for content policy or other errors in result
    if (result.detail) {
      const detail = Array.isArray(result.detail) ? result.detail[0] : result.detail;
      const msg = detail?.msg || detail?.message || JSON.stringify(detail);
      return res.status(200).json({ status: "failed", error: `fal.ai: ${msg}` });
    }

    // Extract video URL — try multiple known field paths
    const videoUrl =
      result?.video?.url ||
      result?.videos?.[0]?.url ||
      result?.video_url ||
      result?.output?.video?.url ||
      result?.output?.url ||
      null;

    if (!videoUrl) {
      return res.status(200).json({
        status: "failed",
        error: "Video URL not found in result. Fields: " + Object.keys(result).join(", "),
      });
    }

    return res.status(200).json({ status: "completed", video_url: videoUrl });
  }

  // ── POST: generate ────────────────────────────────────────────────────────
  if (req.method === "POST") {
    const {
      prompt,
      slug,
      title,
      duration     = 5,
      aspect_ratio = "9:16",
      style,
      style_id,
    } = req.body || {};

    if (!prompt?.trim()) return res.status(400).json({ error: "prompt is required" });
    if (!slug || !/^[a-z0-9-]+$/.test(slug))
      return res.status(400).json({ error: "slug must be lowercase letters, numbers, hyphens" });

    let fullPrompt = prompt.trim();
    if (style?.trim())    fullPrompt += `, ${style.trim()}`;
    if (style_id?.trim()) fullPrompt += `, style:${style_id.trim()}`;

    let d;
    try {
      const r = await fetch(SUBMIT_URL, {
        method: "POST",
        headers: {
          Authorization: `Key ${falKey()}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          prompt: fullPrompt,
          duration: Number(duration),
          aspect_ratio,
        }),
      });
      d = await r.json();
      if (!r.ok) return res.status(400).json({ error: d?.detail || `fal.ai error ${r.status}` });
    } catch (e) {
      return res.status(500).json({ error: e.message || "Seedance request failed" });
    }

    if (!d.request_id) return res.status(500).json({ error: "No request_id from fal.ai" });

    return res.status(200).json({
      request_id:   d.request_id,
      status_url:   encodeURIComponent(d.status_url),
      response_url: encodeURIComponent(d.response_url),
      slug,
      title,
    });
  }

  return res.status(405).json({ error: "Method not allowed" });
}
